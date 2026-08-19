import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

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
    // 双源 token 提取：先读 HttpOnly Cookie（推荐）,失败 fallback 到 Authorization 头
    // 这样支持老前端用 localStorage / Bearer,也支持新前端用 Cookie
    super({
      jwtFromRequest: (req: Request) => {
        const fromCookie = (req as any)?.cookies?.admin_token || (req as any)?.cookies?.customer_token;
        if (fromCookie) return fromCookie;
        // fallback: 兼容老的 Bearer 头
        const auth = req?.headers?.authorization;
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          return auth.slice(7);
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: { sub: number; username?: string; type?: string }) {
    // 校验通过后挂到 request.user 上；type 区分管理员(admin)/顾客(customer)
    return { userId: payload.sub, username: payload.username, type: payload.type || 'admin' };
  }
}
