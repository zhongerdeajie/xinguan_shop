import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateOrderDetailDto } from './dto/create-order-detail.dto';
import { UpdateOrderDetailDto } from './dto/update-order-detail.dto';

@Injectable()
export class OrderDetailsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, orderId?: number, dishId?: number, setmealId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (orderId) where.orderId = orderId;
    if (dishId) where.dishId = dishId;
    if (setmealId) where.setmealId = setmealId;

    const [data, total] = await Promise.all([
      this.prisma.orderDetail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
        include: {
          order: true,
          dish: true,
          setmeal: true,
        },
      }),
      this.prisma.orderDetail.count({ where }),
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
    const orderDetail = await this.prisma.orderDetail.findUnique({
      where: { id },
      include: {
        order: true,
        dish: true,
        setmeal: true,
      },
    });
    if (!orderDetail) {
      throw new NotFoundException(`订单明细 ID ${id} 不存在`);
    }
    return orderDetail;
  }

  async create(data: CreateOrderDetailDto & { image?: string }) {
    return this.prisma.orderDetail.create({
      data: {
        orderId: data.orderId,
        name: data.name,
        number: data.number,
        amount: Number(data.amount),
        dishId: data.dishId,
        setmealId: data.setmealId,
        image: data.image,
      },
      include: {
        order: true,
        dish: true,
        setmeal: true,
      },
    });
  }

  async update(id: number, data: UpdateOrderDetailDto) {
    await this.findOne(id);
    const updateData: Record<string, unknown> = {};
    if (data.orderId !== undefined) updateData.orderId = data.orderId;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.number !== undefined) updateData.number = data.number;
    if (data.amount !== undefined) updateData.amount = Number(data.amount);
    if (data.dishId !== undefined) updateData.dishId = data.dishId;
    if (data.setmealId !== undefined) updateData.setmealId = data.setmealId;
    return this.prisma.orderDetail.update({
      where: { id },
      data: updateData,
      include: {
        order: true,
        dish: true,
        setmeal: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.orderDetail.delete({
      where: { id },
    });
  }
}
