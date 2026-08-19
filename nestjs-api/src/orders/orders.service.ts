import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersGateway } from './orders.gateway';

// 订单状态常量
export const ORDER_STATUS = {
  PENDING_PAYMENT: 1, // 待付款
  PENDING_ACCEPT: 2, // 待接单
  ACCEPTED: 3, // 已接单
  DELIVERING: 4, // 派送中
  COMPLETED: 5, // 已完成
  CANCELLED: 6, // 已取消
};

// 订单状态流转规则
const STATUS_TRANSITIONS: Record<number, number[]> = {
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PENDING_ACCEPT, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PENDING_ACCEPT]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.DELIVERING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.DELIVERING]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private readonly gateway: OrdersGateway,
  ) {}

  async findAll(
    page: number,
    limit: number,
    status?: number,
    userId?: number,
    number?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (number) where.number = { contains: number };

    const [data, total] = await Promise.all([
      this.prisma.orders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderTime: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
          addressBook: true,
          orderDetails: {
            include: {
              dish: true,
              setmeal: true,
            },
          },
        },
      }),
      this.prisma.orders.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
        addressBook: true,
        orderDetails: {
          include: {
            dish: true,
            setmeal: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`订单 ID ${id} 不存在`);
    }
    return order;
  }

  async create(data: {
    number?: string;
    userId: number;
    addressBookId: number;
    orderTime: Date;
    checkoutTime?: Date;
    payMethod?: number;
    payStatus?: number;
    amount: number;
    remark?: string;
    phone?: string;
    address?: string;
    userName?: string;
    consignee?: string;
    estimatedDeliveryTime?: Date;
    packAmount?: number;
    tablewareNumber?: number;
  }) {
    const orderNumber = data.number || this.generateOrderNumber();

    const order = await this.prisma.orders.create({
      data: {
        ...data,
        number: orderNumber,
        status: ORDER_STATUS.PENDING_PAYMENT,
        payMethod: data.payMethod ?? 1,
        payStatus: data.payStatus ?? 0,
        deliveryStatus: 1,
        tablewareStatus: 1,
        orderTime: data.orderTime || new Date(),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
        addressBook: true,
        orderDetails: true,
      },
    });

    // 实时通知所有管理员（WebSocket 推送）
    // 用 setImmediate 避免阻塞请求返回,失败也不影响主流程
    setImmediate(() => {
      try {
        this.gateway.broadcastNewOrder({
          id: order.id,
          number: order.number,
          userId: order.userId,
          amount: order.amount,
          status: order.status,
          createdAt: order.orderTime,
        });
      } catch (e) {
        console.warn('[orders.gateway] broadcastNewOrder 失败:', (e as Error).message);
      }
    });

    return order;
  }

  async update(id: number, data: any, operatorId?: number) {
    await this.findOne(id);
    return this.prisma.orders.update({
      where: { id },
      data: {
        ...data,
        // 审计：记录本次修改的操作人（管理员 userId）
        ...(operatorId ? { updateUser: operatorId, updateTime: new Date() } : {}),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
        addressBook: true,
        orderDetails: true,
      },
    });
  }

  async remove(id: number, operatorId?: number) {
    await this.findOne(id);
    await this.prisma.orderDetail.deleteMany({
      where: { orderId: id },
    });
    // 删除前最后一次审计日志（注意：prisma.orders.delete 不接受 updateUser 字段，这里只做日志记录）
    if (operatorId) {
      console.log(`[AUDIT] admin ${operatorId} deleted order ${id} at ${new Date().toISOString()}`);
    }
    return this.prisma.orders.delete({
      where: { id },
    });
  }

  async updateStatus(id: number, targetStatus: number, extraData?: Record<string, unknown>, operatorId?: number) {
    const order = await this.findOne(id);
    const currentStatus = order.status;

    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new BadRequestException(
        `无法从状态 ${currentStatus} 流转到状态 ${targetStatus}`,
      );
    }

    const updateData: Record<string, unknown> = { status: targetStatus };

    switch (targetStatus) {
      case ORDER_STATUS.PENDING_ACCEPT:
        updateData.payStatus = 1;
        updateData.checkoutTime = new Date();
        break;
      case ORDER_STATUS.COMPLETED:
        updateData.deliveryStatus = 2;
        break;
      case ORDER_STATUS.CANCELLED:
        updateData.cancelTime = new Date();
        if (typeof extraData?.cancelReason === 'string') {
          updateData.cancelReason = extraData.cancelReason;
        }
        break;
    }

    if (extraData) {
      Object.assign(updateData, extraData);
    }

    // 审计：记录本次状态变更的操作人
    if (operatorId) {
      updateData.updateUser = operatorId;
      updateData.updateTime = new Date();
    }

    return this.prisma.orders.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
        addressBook: true,
        orderDetails: true,
      },
    });
  }

  async pay(id: number, payMethod: number = 1, operatorId?: number) {
    return this.updateStatus(id, ORDER_STATUS.PENDING_ACCEPT, { payMethod, payStatus: 1 }, operatorId);
  }

  async accept(id: number, operatorId?: number) {
    return this.updateStatus(id, ORDER_STATUS.ACCEPTED, undefined, operatorId);
  }

  async startDelivery(id: number, operatorId?: number) {
    return this.updateStatus(id, ORDER_STATUS.DELIVERING, undefined, operatorId);
  }

  async complete(id: number, operatorId?: number) {
    return this.updateStatus(id, ORDER_STATUS.COMPLETED, undefined, operatorId);
  }

  async cancel(id: number, reason?: string, operatorId?: number) {
    return this.updateStatus(id, ORDER_STATUS.CANCELLED, { cancelReason: reason }, operatorId);
  }

  async getStatistics(params?: { startDate?: Date; endDate?: Date }) {
    const where: any = {};
    if (params?.startDate || params?.endDate) {
      where.orderTime = {};
      if (params.startDate) where.orderTime.gte = params.startDate;
      if (params.endDate) where.orderTime.lte = params.endDate;
    }

    const totalSalesResult = await this.prisma.orders.aggregate({
      where: { ...where, status: ORDER_STATUS.COMPLETED },
      _sum: { amount: true },
    });

    const totalUsers = await this.prisma.orders.groupBy({
      by: ['userId'],
      where,
    });

    const totalOrders = await this.prisma.orders.count({ where });

    const statusCounts = await this.prisma.orders.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayWhere = { ...where, orderTime: { gte: today } };

    const todaySalesResult = await this.prisma.orders.aggregate({
      where: { ...todayWhere, status: ORDER_STATUS.COMPLETED },
      _sum: { amount: true },
    });

    const todayOrders = await this.prisma.orders.count({ where: todayWhere });

    const topDishes = await this.prisma.orderDetail.groupBy({
      by: ['dishId', 'name'],
      where: {
        order: {
          ...where,
          status: { in: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.DELIVERING, ORDER_STATUS.COMPLETED] },
        },
        dishId: { not: null },
      },
      _sum: { number: true, amount: true },
      orderBy: { _sum: { number: 'desc' } },
      take: 10,
    });

    const topSetmeals = await this.prisma.orderDetail.groupBy({
      by: ['setmealId', 'name'],
      where: {
        order: {
          ...where,
          status: { in: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.DELIVERING, ORDER_STATUS.COMPLETED] },
        },
        setmealId: { not: null },
      },
      _sum: { number: true, amount: true },
      orderBy: { _sum: { number: 'desc' } },
      take: 10,
    });

    return {
      overview: {
        totalSales: totalSalesResult._sum.amount || 0,
        totalUsers: totalUsers.length,
        totalOrders,
        todaySales: todaySalesResult._sum.amount || 0,
        todayOrders,
      },
      statusDistribution: statusCounts.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      topDishes: topDishes
        .filter((item) => item.dishId !== null)
        .map((item) => ({
          dishId: item.dishId,
          name: item.name,
          totalQuantity: item._sum.number || 0,
          totalAmount: item._sum.amount || 0,
        })),
      topSetmeals: topSetmeals
        .filter((item) => item.setmealId !== null)
        .map((item) => ({
          setmealId: item.setmealId,
          name: item.name,
          totalQuantity: item._sum.number || 0,
          totalAmount: item._sum.amount || 0,
        })),
    };
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const timestamp = now.getTime().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${timestamp}${random}`;
  }
}
