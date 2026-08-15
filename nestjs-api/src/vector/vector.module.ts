import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { VectorController } from './vector.controller';
import { VectorService } from './vector.service';

@Module({
  imports: [HttpModule],
  controllers: [VectorController],
  providers: [VectorService],
})
export class VectorModule {}
