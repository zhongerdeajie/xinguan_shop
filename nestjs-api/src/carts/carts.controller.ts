import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CreateCartDto, UpdateCartDto } from './dto';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CartsService } from './carts.service';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';

@ApiTags('购物车管理')
@UseGuards(CustomerAuthGuard)
@ApiBearerAuth()
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @ApiOperation({ summary: '获取当前登录顾客的购物车列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Req() req: any,
    @Query('userId') _userId?: string, // 保留参数兼容旧前端，但服务端忽略，强制用 token 中的 userId
  ) {
    const userId = Number(req?.user?.userId ?? 0);
    return this.cartsService.findAll(+page, +limit, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取购物车项详情' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const cart = await this.cartsService.findOne(+id);
    // 越权校验：只能看自己的购物车项
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (cart.userId !== currentUserId) {
      throw new ForbiddenException('无权访问他人的购物车项');
    }
    return cart;
  }

  @Post()
  @ApiOperation({ summary: '创建购物车项' })
  async create(
    @Body() createCartDto: CreateCartDto,
    @Req() req: any,
  ) {
    const userId = Number(req?.user?.userId ?? req?.user?.id ?? 0);
    return this.cartsService.create({
      ...createCartDto,
      userId,
      name: createCartDto.dishId ? `菜品 ${createCartDto.dishId}` : `套餐 ${createCartDto.setmealId}`,
      amount: 0,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新购物车项' })
  async update(@Param('id') id: string, @Body() updateCartDto: UpdateCartDto, @Req() req: any) {
    // 越权校验：只能改自己的购物车项
    const cart = await this.cartsService.findOne(+id);
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (cart.userId !== currentUserId) {
      throw new ForbiddenException('无权修改他人的购物车项');
    }
    return this.cartsService.update(+id, updateCartDto);
  }

  // 注意：/clear 必须在 /:id 之前定义，否则 /clear 会被 /:id 匹配走（路由顺序敏感）
  @Delete('clear')
  @ApiOperation({ summary: '清空当前登录顾客的购物车' })
  async clear(@Req() req: any) {
    // 强制从 token 取 userId，不接受 URL 参数，防止越权清空他人购物车
    const userId = Number(req?.user?.userId ?? 0);
    return this.cartsService.clearByUserId(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除购物车项' })
  async remove(@Param('id') id: string, @Req() req: any) {
    // 越权校验：只能删自己的购物车项
    const cart = await this.cartsService.findOne(+id);
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (cart.userId !== currentUserId) {
      throw new ForbiddenException('无权删除他人的购物车项');
    }
    return this.cartsService.remove(+id);
  }
}
