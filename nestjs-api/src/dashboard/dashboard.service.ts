import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalOrders, totalDishes, totalUsers, revenueAgg, recentOrders, orderDetails] = await Promise.all([
      this.prisma.orders.count(),
      this.prisma.dish.count(),
      this.prisma.user.count(),
      this.prisma.orders.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.orders.findMany({
        where: { orderTime: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
        select: { orderTime: true },
      }),
      this.prisma.orderDetail.findMany({ select: { name: true, number: true } }),
    ]);

    // 近 7 天订单趋势（按日期聚合）
    const trendMap: Record<string, number> = {};
    for (const o of recentOrders) {
      if (!o.orderTime) continue;
      const day = o.orderTime.toISOString().slice(0, 10);
      trendMap[day] = (trendMap[day] || 0) + 1;
    }
    const trend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      trend.push({ date: d, count: trendMap[d] || 0 });
    }

    // 菜品销量排行
    const salesMap: Record<string, number> = {};
    for (const d of orderDetails) {
      if (!d.name) continue;
      salesMap[d.name] = (salesMap[d.name] || 0) + (d.number || 0);
    }
    const topDishes = Object.entries(salesMap)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    return {
      totalOrders,
      totalDishes,
      totalUsers,
      todayRevenue: Number(revenueAgg._sum.amount || 0),
      trend,
      topDishes,
    };
  }
}
