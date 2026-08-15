import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';

@Injectable()
export class CartsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, userId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.shoppingCart.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createTime: 'desc' },
        include: {
          user: true,
          dish: true,
          setmeal: true,
        },
      }),
      this.prisma.shoppingCart.count({ where }),
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
    const cart = await this.prisma.shoppingCart.findUnique({
      where: { id },
      include: {
        user: true,
        dish: true,
        setmeal: true,
      },
    });
    if (!cart) {
      throw new NotFoundException(`购物车项 ID ${id} 不存在`);
    }
    return cart;
  }

  async create(data: CreateCartDto & { userId: number; name?: string; image?: string; amount: number }) {
    return this.prisma.shoppingCart.create({
      data: {
        userId: data.userId,
        dishId: data.dishId,
        setmealId: data.setmealId,
        dishFlavor: data.dishFlavor,
        number: data.number,
        name: data.name,
        image: data.image,
        amount: data.amount,
        createTime: new Date(),
      },
      include: {
        user: true,
        dish: true,
        setmeal: true,
      },
    });
  }

  async update(id: number, data: UpdateCartDto) {
    await this.findOne(id);
    return this.prisma.shoppingCart.update({
      where: { id },
      data,
      include: {
        user: true,
        dish: true,
        setmeal: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.shoppingCart.delete({
      where: { id },
    });
  }

  async clearByUserId(userId: number) {
    return this.prisma.shoppingCart.deleteMany({
      where: { userId },
    });
  }
}
