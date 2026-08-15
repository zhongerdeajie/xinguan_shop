import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';

@Controller('auth')
@ApiTags('认证')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '登录（bcrypt 校验 + 签发 JWT）' })
  async login(@Body() body: LoginDto) {
    const { token, user } = await this.authService.login(body.username, body.password);
    // 同时返回 user 对象和顶层字段，兼容 Vue 管理后台与 Next.js 两种前端
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
  @ApiOperation({ summary: '退出登录（前端清除 token 即可）' })
  async logout() {
    return { message: '退出成功' };
  }

  @Post('customer/register')
  @ApiOperation({ summary: '顾客注册（手机号 + 密码）' })
  async customerRegister(@Body() body: CustomerRegisterDto) {
    return this.authService.registerCustomer(body.name, body.phone, body.password);
  }

  @Post('customer/login')
  @ApiOperation({ summary: '顾客登录（手机号 + 密码）' })
  async customerLogin(@Body() body: CustomerLoginDto) {
    return this.authService.loginCustomer(body.phone, body.password);
  }
}