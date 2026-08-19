import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../common/prisma.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

// 复用同一份 JWT_SECRET（启动时已在 auth.module.ts / jwt.strategy.ts 强制校验过）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    '环境变量 JWT_SECRET 未配置或长度不足 16，拒绝启动。请在 .env 中设置一个足够长的随机字符串。',
  );
}

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
