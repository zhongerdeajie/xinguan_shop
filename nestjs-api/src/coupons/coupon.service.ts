import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createTime: 'desc' } });
  }

  create(data: { title: string; amount: number; threshold: number; status?: number }) {
    return this.prisma.coupon.create({
      data: {
        title: data.title,
        amount: String(data.amount),
        threshold: String(data.threshold),
        status: data.status ?? 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
    });
  }

  update(id: number, data: UpdateCouponDto) {
    const numericData: Record<string, unknown> = { updateTime: new Date() };
    if (data.title !== undefined) numericData.title = data.title;
    if (data.amount !== undefined) numericData.amount = Number(data.amount);
    if (data.threshold !== undefined) numericData.threshold = Number(data.threshold);
    if (data.status !== undefined) numericData.status = data.status;
    return this.prisma.coupon.update({
      where: { id },
      data: numericData,
    });
  }

  remove(id: number) {
    // 软删
    return this.prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
