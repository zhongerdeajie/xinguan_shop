import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // 管理端接口只允许管理员 token（顾客 token 不能进后台）
    if (err || !user || user.type !== 'admin') {
      throw err || new UnauthorizedException('请先以管理员身份登录');
    }
    return user;
  }
}
