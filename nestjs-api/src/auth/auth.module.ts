import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../common/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

// 启动时强制校验 JWT_SECRET（与 jwt.strategy.ts 一致），避免使用弱默认值
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    '环境变量 JWT_SECRET 未配置或长度不足 16，拒绝启动。请在 .env 中设置一个足够长的随机字符串。',
  );
}

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // 导出 JwtModule 让其他模块（如 OrdersGateway）能用 JwtService 验证 WebSocket 握手时的 token
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
