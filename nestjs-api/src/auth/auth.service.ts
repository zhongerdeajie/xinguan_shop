import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 登录：校验用户名 + bcrypt 密码，通过后签发 JWT
   */
  async login(username: string, password: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { username },
    });

    if (!employee) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (employee.status !== 1) {
      throw new UnauthorizedException('账号已被禁用，请联系管理员');
    }

    const passwordOk = await bcrypt.compare(password, employee.password);
    if (!passwordOk) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const payload = { sub: employee.id, username: employee.username, type: 'admin' };
    const token = await this.jwtService.signAsync(payload);

    return {
      token,
      user: {
        id: employee.id,
        username: employee.username,
        name: employee.name,
        role: 'admin',
      },
    };
  }

  /**
   * 顾客注册（手机号 + 密码）
   */
  async registerCustomer(name: string, phone: string, password: string) {
    const existing = await this.prisma.user.findFirst({ where: { phone } });
    if (existing) {
      throw new ConflictException('该手机号已注册');
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        name,
        phone,
        password: hashed,
        createTime: new Date(),
      },
    });
    // 自动创建默认收货地址，方便顾客直接下单
    await this.prisma.addressBook.create({
      data: {
        userId: user.id,
        consignee: name,
        phone,
        detail: '默认地址（请修改）',
        isDefault: 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
    });
    return this.signCustomer(user);
  }

  /**
   * 顾客登录（手机号 + 密码）
   */
  async loginCustomer(phone: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user || !user.password) {
      throw new UnauthorizedException('手机号或密码错误');
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('手机号或密码错误');
    }
    return this.signCustomer(user);
  }

  private async signCustomer(user: any) {
    const payload = { sub: user.id, username: user.phone, type: 'customer' };
    const token = await this.jwtService.signAsync(payload);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: 'customer',
      },
    };
  }
}
