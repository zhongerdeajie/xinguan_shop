import { Module } from '@nestjs/common';
import { SetmealsController } from './setmeals.controller';
import { SetmealsService } from './setmeals.service';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SetmealsController],
  providers: [SetmealsService],
  exports: [SetmealsService],
})
export class SetmealsModule {}
