// 管理员新订单实时推送 WebSocket Gateway
//
// 协议：
//   客户端连 ws://host/ws/admin-orders   (带 cookie admin_token 或 Authorization Bearer)
//   服务器校验 JWT 通过后,把 socket 加入 "admin:orders" room
//   新订单创建后,广播 "order:new" 事件,带订单摘要

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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// 路径前缀 /ws,对应 nginx /ws/ location
@WebSocketGateway({
  namespace: '/ws/admin-orders',
  cors: {
    origin: true,        // 与 main.ts 的 CORS 配置保持一致(白名单)
    credentials: true,
  },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

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
      // 只有管理员 type=admin 能订阅
      if (payload.type !== 'admin') {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      client.join('admin:orders');
      this.logger.log(`管理员 ${payload.username} (id=${payload.sub}) 连接 /ws/admin-orders`);
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