// 管理员新订单实时推送 WebSocket Gateway
//
// 协议：
//   客户端连 ws://host/ws/admin-orders   (带 cookie admin_token 或 Authorization Bearer)
//   服务器校验 JWT 通过后,把 socket 加入 "admin:orders" room
//   新订单创建后,广播 "order:new" 事件,带订单摘要
//
// Pub/Sub 通道 (2026-08-20 新增):
//   - Go service SubmitOrder 成功后 rdb.Publish("order:new", payloadJSON)
//   - 本 Gateway 启动时订阅 "order:new" 频道,收到即广播给 admin:orders room
//   - 这样 Go service 与 NestJS 不需要直连, 跨服务"新订单通知"由 Redis 通道解耦

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

// 路径前缀 /ws,对应 nginx /ws/ location
@WebSocketGateway({
  namespace: '/ws/admin-orders',
  cors: {
    origin: true,        // 与 main.ts 的 CORS 配置保持一致(白名单)
    credentials: true,
  },
})
export class OrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  // Redis 订阅客户端(独立连接, 不能复用 dishes 的写入客户端)
  private sub!: Redis;
  // Redis 读写客户端(用于断线重连后补拉历史订单事件)
  private client!: Redis;
  // 监听哪个 channel(Go service Publish 一致即可)
  private readonly channel = 'order:new';
  // 事件日志 Stream(outbox-worker XADD, 断线重连后从这里补拉历史)
  private readonly eventStream = 'order:events';
  // 重连补拉最近多少条订单
  private readonly historyLimit = 20;

  constructor(
    private readonly jwtService: JwtService,
    // 不注入 OrdersService,避免循环依赖。Gateway 只负责广播,不直接调用 service。
  ) {}

  /**
   * 客户端连接时：
   * 1. 从 cookie 或 Authorization 头提取 token
   * 2. 验证 JWT,失败断开
   * 3. 验证通过加入 admin:orders room
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        this.extractTokenFromCookie(client) ??
        this.extractTokenFromHeader(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.type !== 'admin') {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      client.join('admin:orders');
      this.logger.log(`管理员 ${payload.username} (id=${payload.sub}) 连接 /ws/admin-orders`);

      // 断线重连后补拉历史订单(防止断线期间漏掉推送)
      // 从 Redis Stream order:events 取最近 N 条, 一次性补发给刚连接的管理员
      await this.sendOrderHistory(client);
      client.emit('connected', { message: '已连接新订单推送', userId: payload.sub });
    } catch (err) {
      this.logger.warn(`WS 鉴权失败: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.username) {
      this.logger.log(`管理员 ${client.data.username} 断开 /ws/admin-orders`);
    }
  }

  /**
   * 模块启动时建立 Redis 订阅客户端, 监听 "order:new" 频道
   *
   * 失败处理:
   *   - 订阅失败 / 连接断开: ioredis 会自动重连, 这里只记日志
   *   - 解码失败: 记 warn 跳过, 不影响其它事件
   */
  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

    // 订阅客户端
    this.sub = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.sub.on('error', (err) => {
      this.logger.warn(`Redis 订阅客户端错误: ${err.message}`);
    });
    this.sub.on('reconnecting', (ms) => {
      this.logger.warn(`Redis 订阅客户端重连中 (${ms}ms)`);
    });
    this.sub.on('ready', () => {
      this.logger.log('✅ Redis 订阅客户端就绪, channel=order:new');
    });

    await this.sub.subscribe(this.channel);
    this.sub.on('message', (channel, message) => {
      if (channel !== this.channel) return;
      try {
        const order = JSON.parse(message);
        this.broadcastNewOrder(order);
      } catch (err) {
        this.logger.warn(`order:new 消息解析失败: ${(err as Error).message}`);
      }
    });

    // 读写客户端(用于断线重连后补拉历史订单事件)
    // 注意: ioredis 的订阅连接(pub/sub)不能执行普通命令, 必须单独开一个
    this.client = new Redis(redisUrl, { lazyConnect: true });
    this.client.on('error', (err) => {
      this.logger.warn(`Redis 读写客户端错误: ${err.message}`);
    });
    await this.client.connect();
    this.logger.log('✅ Redis 读写客户端就绪(history 补拉)');
  }

  async onModuleDestroy() {
    if (this.sub) {
      try {
        await this.sub.unsubscribe(this.channel);
      } catch {
        /* ignore */
      }
      this.sub.disconnect();
    }
    if (this.client) {
      this.client.disconnect();
    }
  }

  /**
   * 断线重连后补拉历史订单事件
   *
   * 从 Redis Stream `order:events` 取最近 N 条(按时间倒序), 反转后按时间正序发给客户端。
   * 每条解析出 order 摘要, 发给刚连接的管理员, 客户端 onNewOrder 会逐个处理。
   *
   * 为什么从 Stream 补拉而不是 MySQL:
   *   - outbox-worker 已经把事件 XADD 进 Stream, 它就是"订单事件日志"
   *   - Stream 只存事件, 不关心订单当前状态, 正适合补拉"发生了什么"
   *   - MySQL 查询需要 join, Stream 一次 XREVRANGE 就够
   */
  private async sendOrderHistory(client: Socket): Promise<void> {
    try {
      if (!this.client) return;
      // XREVRANGE 取最近 historyLimit 条(从最新往旧), 然后反转成时间正序
      const raw = await this.client.xrevrange(
        this.eventStream,
        '+',
        '-',
        'COUNT',
        this.historyLimit,
      );
      if (!raw || raw.length === 0) {
        return;
      }
      // 反转: 从旧到新
      const orders = raw
        .slice()
        .reverse()
        .map(([, fields]) => this.parseStreamEvent(fields))
        .filter((o): o is Record<string, unknown> => !!o);
      if (orders.length === 0) {
        return;
      }
      client.emit('order:history', { orders });
      this.logger.log(
        `📜 补拉 ${orders.length} 条历史订单给 ${client.data.username}`,
      );
    } catch (err) {
      this.logger.warn(
        `补拉历史订单失败: ${(err as Error).message}(不阻塞连接, 新订单推送仍正常)`,
      );
    }
  }

  /** 从 Stream 事件字段解析出 order 摘要 */
  private parseStreamEvent(fields: (string | Buffer)[]): Record<string, unknown> | null {
    try {
      const obj: Record<string, string> = {};
      for (let i = 0; i < fields.length - 1; i += 2) {
        const k = fields[i].toString();
        const v = fields[i + 1].toString();
        obj[k] = v;
      }
      // Stream 里 payload 是完整 order 摘要 JSON(Go service 写的)
      const payloadStr = obj['payload'];
      if (!payloadStr) return null;
      const payload = JSON.parse(payloadStr);
      if (!payload || typeof payload !== 'object') return null;
      // 规范化字段(Go service OrderCreatedEvent 字段名)
      return {
        id: payload.order_id ?? payload.id,
        number: payload.order_number ?? payload.number,
        userId: payload.user_id ?? payload.userId,
        amount: payload.amount,
        status: payload.status ?? 1,
        createdAt: payload.created_at ?? payload.createdAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * 广播新订单（供 service 层调用）
   * 在 orders.service.create 完成后调用
   */
  broadcastNewOrder(order: any) {
    if (!this.server) return;
    this.server.to('admin:orders').emit('order:new', {
      id: order.id,
      number: order.number,
      userId: order.userId,
      amount: order.amount,
      status: order.status,
      createdAt: order.createdAt ?? order.orderTime ?? new Date().toISOString(),
    });
  }

  /**
   * 客户端可主动 ack / ping
   */
  @SubscribeMessage('ping')
  handlePing(@MessageBody() _data: any, @ConnectedSocket() client: Socket) {
    return { event: 'pong', data: { ts: Date.now() } };
  }

  // ---- helpers ----
  private extractTokenFromCookie(client: Socket): string | null {
    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      }),
    );
    return cookies['admin_token'] ?? cookies['customer_token'] ?? null;
  }

  private extractTokenFromHeader(client: Socket): string | null {
    const auth = client.handshake.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }
}