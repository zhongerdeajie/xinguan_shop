import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CustomerAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // 顾客端接口只允许顾客 token
    if (err || !user || user.type !== 'customer') {
      throw err || new UnauthorizedException('请先登录顾客账号');
    }
    return user;
  }
}
