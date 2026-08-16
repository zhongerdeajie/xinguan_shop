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
} from '@nestjs/common';
import { CreateOrderDto, UpdateOrderDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrdersService, ORDER_STATUS } from './orders.service';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('订单管理')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ==================== 订单统计 API（必须在 :id 路由之前） ====================

  @Get('statistics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '订单统计概览（销售额、用户数、订单数、销量Top10）' })
  async getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ordersService.getStatistics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  // ==================== 基础 CRUD API ====================

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取订单列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('number') number?: string,
  ) {
    return this.ordersService.findAll(
      +page,
      +limit,
      status ? +status : undefined,
      userId ? +userId : undefined,
      number,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取订单详情' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  @Post()
  @UseGuards(CustomerAuthGuard)
  @ApiOperation({ summary: '创建订单' })
  async create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    const userId = Number(req?.user?.userId ?? req?.user?.id ?? 0);
    return this.ordersService.create({
      ...createOrderDto,
      userId,
      orderTime: new Date(),
      amount: 0,
    });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新订单' })
  async update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(+id, updateOrderDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除订单' })
  async remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }

  // ==================== 订单状态流转 API ====================

  @Put(':id/pay')
  @UseGuards(CustomerAuthGuard)
  @ApiOperation({ summary: '支付订单 (待付款 → 待接单)' })
  async pay(@Param('id') id: string, @Body('payMethod') payMethod?: number) {
    return this.ordersService.pay(+id, payMethod);
  }

  @Put(':id/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '接单 (待接单 → 已接单)' })
  async accept(@Param('id') id: string) {
    return this.ordersService.accept(+id);
  }

  @Put(':id/start-delivery')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '开始派送 (已接单 → 派送中)' })
  async startDelivery(@Param('id') id: string) {
    return this.ordersService.startDelivery(+id);
  }

  @Put(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '完成订单 (派送中 → 已完成)' })
  async complete(@Param('id') id: string) {
    return this.ordersService.complete(+id);
  }

  @Put(':id/customer-cancel')
  @UseGuards(CustomerAuthGuard)
  @ApiOperation({ summary: '顾客取消订单（顾客专用）' })
  async customerCancel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.ordersService.cancel(+id, reason);
  }

  @Put(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '取消订单（管理员）' })
  async cancel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.ordersService.cancel(+id, reason);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新订单状态（通用）' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: number,
    @Body() extraData?: Record<string, unknown>,
  ) {
    return this.ordersService.updateStatus(+id, status, extraData);
  }
}
