import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CouponService } from './coupon.service';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@ApiTags('营销中心')
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get()
  @ApiOperation({ summary: '优惠券列表' })
  findAll() {
    return this.couponService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '创建优惠券' })
  create(@Body() body: { title: string; amount: number; threshold: number }) {
    return this.couponService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新优惠券' })
  update(@Param('id') id: string, @Body() body: UpdateCouponDto) {
    return this.couponService.update(Number(id), body);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除优惠券' })
  remove(@Param('id') id: string) {
    return this.couponService.remove(Number(id));
  }
}
