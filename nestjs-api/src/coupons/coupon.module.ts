import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  imports: [PrismaModule],
  controllers: [CouponController],
  providers: [CouponService],
})
export class CouponModule {}
