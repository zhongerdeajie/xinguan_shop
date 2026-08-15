import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class VectorService {
  private readonly pythonAIBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.pythonAIBaseUrl = this.configService.get<string>('PYTHON_AI_URL', 'http://localhost:5000');
  }

  async search(query: string, topK?: number, entityType?: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.pythonAIBaseUrl}/api/v1/search`, {
          query,
          top_k: topK || 5,
          entity_type: entityType || null,
        }),
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        '向量检索服务暂时不可用',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async index(doc: { doc_id: number; entity_type: string; entity_id: number; content: string }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.pythonAIBaseUrl}/api/v1/index`, doc),
      );
      return response.data;
    } catch (error) {
      throw new HttpException(
        '向量索引服务暂时不可用',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getStats() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.pythonAIBaseUrl}/health`),
      );
      return {
        python_ai_status: response.data.status || 'unknown',
        python_ai_version: response.data.version || 'unknown',
      };
    } catch (error) {
      return {
        python_ai_status: 'unreachable',
        python_ai_version: 'unknown',
      };
    }
  }
}
