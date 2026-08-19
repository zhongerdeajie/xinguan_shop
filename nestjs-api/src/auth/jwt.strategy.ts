import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// 启动时强制校验 JWT_SECRET，避免使用弱默认值导致 token 可被伪造
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    '环境变量 JWT_SECRET 未配置或长度不足 16，拒绝启动。请在 .env 中设置一个足够长的随机字符串。',
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: { sub: number; username?: string; type?: string }) {
    // 校验通过后挂到 request.user 上；type 区分管理员(admin)/顾客(customer)
    return { userId: payload.sub, username: payload.username, type: payload.type || 'admin' };
  }
}
