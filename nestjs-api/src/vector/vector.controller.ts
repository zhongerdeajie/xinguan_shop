import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VectorService } from './vector.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Vector')
@Controller('vector')
export class VectorController {
  constructor(private readonly vectorService: VectorService) {}

  @Post('search')
  @ApiOperation({ summary: '语义检索 - 代理到 Python AI 服务' })
  async search(@Body() body: { query: string; top_k?: number; entity_type?: string }) {
    return this.vectorService.search(body.query, body.top_k, body.entity_type);
  }

  @Post('index')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '索引文档 - 代理到 Python AI 服务（仅管理员）' })
  async index(@Body() body: { doc_id: number; entity_type: string; entity_id: number; content: string }) {
    return this.vectorService.index(body);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取向量服务状态（仅管理员）' })
  async stats() {
    return this.vectorService.getStats();
  }
}
