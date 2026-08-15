import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VectorService } from './vector.service';

@ApiTags('Vector')
@ApiBearerAuth()
@Controller('vector')
export class VectorController {
  constructor(private readonly vectorService: VectorService) {}

  @Post('search')
  @ApiOperation({ summary: '语义检索 - 代理到 Python AI 服务' })
  async search(@Body() body: { query: string; top_k?: number; entity_type?: string }) {
    return this.vectorService.search(body.query, body.top_k, body.entity_type);
  }

  @Post('index')
  @ApiOperation({ summary: '索引文档 - 代理到 Python AI 服务' })
  async index(@Body() body: { doc_id: number; entity_type: string; entity_id: number; content: string }) {
    return this.vectorService.index(body);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取向量服务状态' })
  async stats() {
    return this.vectorService.getStats();
  }
}
