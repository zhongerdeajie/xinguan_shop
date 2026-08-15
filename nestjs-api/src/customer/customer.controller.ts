import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';
import { CustomerService } from './customer.service';

@ApiTags('顾客中心')
@UseGuards(CustomerAuthGuard)
@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get('profile')
  @ApiOperation({ summary: '我的资料' })
  async profile(@Req() req: any) {
    return this.customerService.getProfile(req.user.userId);
  }

  @Get('orders')
  @ApiOperation({ summary: '我的订单（购物记录）' })
  async orders(@Req() req: any) {
    return this.customerService.getOrders(req.user.userId);
  }

  @Get('chat-history')
  @ApiOperation({ summary: '我的聊天记录' })
  async chatHistory(@Req() req: any) {
    return this.customerService.getChatHistory(req.user.userId);
  }

  @Get('history')
  @ApiOperation({ summary: '我的浏览记录' })
  async browseHistory(@Req() req: any) {
    return this.customerService.getBrowseHistory(req.user.userId);
  }

  @Post('history')
  @ApiOperation({ summary: '记录浏览（点开菜品时调用）' })
  async addBrowse(@Req() req: any, @Body() body: { dishId: number }) {
    return this.customerService.addBrowse(req.user.userId, Number(body.dishId));
  }

  @Get('coupons/available')
  @ApiOperation({ summary: '可领取的优惠券' })
  async availableCoupons() {
    return this.customerService.getAvailableCoupons();
  }

  @Get('coupons')
  @ApiOperation({ summary: '我的优惠券' })
  async myCoupons(@Req() req: any) {
    return this.customerService.getMyCoupons(req.user.userId);
  }

  @Post('coupons/claim')
  @ApiOperation({ summary: '领取优惠券' })
  async claimCoupon(@Req() req: any, @Body() body: { couponId: number }) {
    return this.customerService.claimCoupon(req.user.userId, Number(body.couponId));
  }
}
