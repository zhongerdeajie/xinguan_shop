import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AiService } from './ai.service';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI 对话' })
  async chat(
    @Body() body: { message: string; sessionId?: string },
    @Req() req: any,
  ) {
    const customer = this.extractCustomerAuth(req);
    return this.aiService.chat(body.message, body.sessionId, customer?.userId, customer?.token);
  }

  @Post('search')
  @ApiOperation({ summary: '语义检索' })
  async search(@Body() body: { query: string; topK?: number; entityType?: string }) {
    return this.aiService.search(body.query, body.topK, body.entityType);
  }

  @Post('bargain')
  @ApiOperation({ summary: '预算凑单（0/1 背包最优组合）' })
  async bargain(@Body() body: { budget: number; dishIds?: number[] }) {
    return this.aiService.bargain(Number(body.budget), body.dishIds);
  }

  @Post('query')
  @ApiOperation({ summary: 'RAG 问答' })
  async ragQuery(@Body() body: { message: string }) {
    return this.aiService.ragQuery(body.message);
  }

  /** 验证顾客 token；游客或无效 token 返回 undefined。 */
  private extractCustomerAuth(req: any): { userId: number; token: string } | undefined {
    const auth: string | undefined = req?.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    const token = auth.slice(7);
    try {
      const payload = this.jwtService.verify(token);
      const userId = Number(payload?.sub);
      if (payload?.type === 'customer' && userId > 0) return { userId, token };
    } catch {
      // 无效 token 按游客处理。
    }
    return undefined;
  }
}
