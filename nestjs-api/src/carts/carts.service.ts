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
          user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
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
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
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
    let dish: any = null;
    let setmeal: any = null;
    if (data.dishId) {
      dish = await this.prisma.dish.findUnique({ where: { id: data.dishId } });
    }
    if (data.setmealId) {
      setmeal = await this.prisma.setmeal.findUnique({ where: { id: data.setmealId } });
    }
    const name = dish?.name || setmeal?.name || data.name || '';
    const image = dish?.image || setmeal?.image || data.image || '';
    const price = dish?.price || setmeal?.price || 0;
    const amount = price * (data.number || 1);
    return this.prisma.shoppingCart.create({
      data: {
        userId: data.userId,
        dishId: data.dishId,
        setmealId: data.setmealId,
        dishFlavor: data.dishFlavor,
        number: data.number,
        name,
        image,
        amount,
        createTime: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
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
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
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
