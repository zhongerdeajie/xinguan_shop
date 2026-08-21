import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        sex: true,
        avatar: true,
        createTime: true,
      },
    });
  }

  async getOrders(userId: number) {
    return this.prisma.orders.findMany({
      where: { userId },
      orderBy: { orderTime: 'desc' },
      include: { orderDetails: true },
    });
  }

  async getChatHistory(userId: number) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createTime: 'asc' },
    });
  }

  async addBrowse(userId: number, dishId: number) {
    return this.prisma.browseHistory.create({
      data: { userId, dishId, viewTime: new Date() },
    });
  }

  async getBrowseHistory(userId: number) {
    return this.prisma.browseHistory.findMany({
      where: { userId },
      orderBy: { viewTime: 'desc' },
      take: 50,
      include: {
        dish: {
          select: { id: true, name: true, price: true, description: true },
        },
      },
    });
  }

  /** 可领取的优惠券列表 */
  async getAvailableCoupons() {
    return this.prisma.coupon.findMany({
      where: { status: 1 },
      orderBy: { createTime: 'desc' },
    });
  }

  /** 我的优惠券 */
  async getMyCoupons(userId: number) {
    return this.prisma.userCoupon.findMany({
      where: { userId },
      orderBy: { claimedTime: 'desc' },
      include: { coupon: true },
    });
  }

  /** 领取优惠券 */
  async claimCoupon(userId: number, couponId: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon || coupon.status !== 1) {
      throw new BadRequestException('优惠券不存在或已停发');
    }
    const exists = await this.prisma.userCoupon.findFirst({
      where: { userId, couponId },
    });
    if (exists) {
      throw new ConflictException('你已经领过这张券了');
    }
    const uc = await this.prisma.userCoupon.create({
      data: { userId, couponId, status: 0, claimedTime: new Date() },
      include: { coupon: true },
    });
    // 写领券流水(CLAIMED 动作, 只追加) —— 与 Go 核销写 USED 形成完整 user_coupon_log 流水
    try {
      await this.prisma.userCouponLog.create({
        data: {
          userId,
          couponId,
          userCouponId: uc.id,
          action: 'CLAIMED',
          createdAt: new Date(),
        },
      });
    } catch (err) {
      // 流水失败不影响领券主流程(只做审计/对账用途), 但打印便于排查
      console.error(`[WARN] 写 user_coupon_log(CLAIMED) 失败 userId=${userId} couponId=${couponId}:`, (err as Error).message);
    }
    return uc;
  }
}
