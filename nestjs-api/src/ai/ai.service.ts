import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AiService {
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.aiServiceUrl = config.get('AI_SERVICE_URL', 'http://localhost:5000');
  }

  async chat(message: string, sessionId?: string, userId?: number, customerToken?: string) {
    const data = await this.callAI(
      '/api/v1/chat',
      {
        message,
        session_id: sessionId,
        user_id: userId ? String(userId) : undefined,
      },
      customerToken,
    );
    // 顾客登录后自动把问答存入聊天记录
    if (userId) {
      await this.saveChat(userId, message, data);
    }
    return data;
  }

  /**
   * 预算凑单：0/1 背包最优组合（金额尽量接近预算）
   */
  async bargain(budget: number, dishIds?: number[]) {
    const dishes = await this.prisma.dish.findMany({
      where: {
        status: 1,
        ...(dishIds && dishIds.length ? { id: { in: dishIds } } : {}),
      },
    });
    if (dishes.length === 0) {
      return { budget, total: 0, items: [] };
    }

    const maxBudget = Math.max(0, Math.floor(budget * 100));
    const prices = dishes.map((d) => Math.round(Number(d.price) * 100));
    const dp = new Array(maxBudget + 1).fill(0);
    const choose: boolean[][] = Array.from({ length: dishes.length }, () =>
      new Array(maxBudget + 1).fill(false),
    );

    for (let i = 0; i < dishes.length; i++) {
      for (let w = maxBudget; w >= prices[i]; w--) {
        if (dp[w - prices[i]] + prices[i] > dp[w]) {
          dp[w] = dp[w - prices[i]] + prices[i];
          choose[i][w] = true;
        }
      }
    }

    let w = maxBudget;
    const items: { dishId: number; name: string; price: number }[] = [];
    for (let i = dishes.length - 1; i >= 0; i--) {
      if (choose[i][w]) {
        items.push({
          dishId: dishes[i].id,
          name: dishes[i].name,
          price: Number(dishes[i].price),
        });
        w -= prices[i];
      }
    }

    return { budget, total: dp[maxBudget] / 100, items };
  }

  async search(query: string, topK?: number, entityType?: string) {
    return this.callAI('/api/v1/search', { query, top_k: topK, entity_type: entityType });
  }

  async ragQuery(message: string) {
    return this.callAI('/api/v1/query', { message });
  }

  private async callAI(path: string, body: any, customerToken?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}${path}`, body, {
          headers: customerToken ? { Authorization: `Bearer ${customerToken}` } : undefined,
        }),
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        'AI 服务暂时不可用',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async saveChat(userId: number, userMessage: string, aiData: any) {
    try {
      await this.prisma.chatMessage.createMany({
        data: [
          {
            userId,
            role: 'user',
            content: String(userMessage).slice(0, 2000),
            createTime: new Date(),
          },
          {
            userId,
            role: 'assistant',
            content: String(aiData?.response || '').slice(0, 2000),
            intent: aiData?.agent || aiData?.intent || null,
            createTime: new Date(),
          },
        ],
      });
    } catch (e) {
      // 存档失败不影响聊天本身
    }
  }
}
