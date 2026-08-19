import { Body, Controller, Post, BadRequestException, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';

// Cookie 配置：12 小时有效,与 JWT expiresIn 一致
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const COOKIE_OPTIONS = {
  httpOnly: true,         // JS 读不到 → 防 XSS
  secure: false,          // 本地 HTTP,上线后改 true 强制 HTTPS
  sameSite: 'lax' as const, // 防 CSRF:第三方网站带不过来
  path: '/',              // 所有路径都带
  maxAge: COOKIE_MAX_AGE_MS,
};

@Controller('auth')
@ApiTags('认证')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '管理员登录（bcrypt + JWT,颁发 HttpOnly Cookie）' })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(body.username, body.password);
    // Set-Cookie:浏览器自动存,后续请求自动带,JS 读不到
    res.cookie('admin_token', token, COOKIE_OPTIONS);
    // 同时返回 token 兼容旧的 localStorage 前端（Vue admin 后台）
    return {
      token,
      user,
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
  }

  @Post('register')
  @ApiOperation({ summary: '注册（暂不开放自助注册，避免任何人创建管理员）' })
  async register() {
    throw new BadRequestException('暂不支持自助注册，请联系管理员创建账号');
  }

  @Post('logout')
  @ApiOperation({ summary: '退出登录（清除 Cookie）' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    res.clearCookie('customer_token', { path: '/' });
    return { message: '退出成功' };
  }

  @Post('customer/register')
  @ApiOperation({ summary: '顾客注册（手机号 + 密码,颁发 HttpOnly Cookie）' })
  async customerRegister(
    @Body() body: CustomerRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.registerCustomer(body.name, body.phone, body.password);
    res.cookie('customer_token', token, COOKIE_OPTIONS);
    return { token, user };
  }

  @Post('customer/login')
  @ApiOperation({ summary: '顾客登录（手机号 + 密码,颁发 HttpOnly Cookie）' })
  async customerLogin(
    @Body() body: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.loginCustomer(body.phone, body.password);
    res.cookie('customer_token', token, COOKIE_OPTIONS);
    return { token, user };
  }
}