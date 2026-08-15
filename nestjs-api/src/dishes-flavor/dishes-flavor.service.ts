import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DishesFlavorService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, dishId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (dishId) where.dishId = dishId;

    const [data, total] = await Promise.all([
      this.prisma.dishFlavor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
        include: {
          dish: true,
        },
      }),
      this.prisma.dishFlavor.count({ where }),
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
    const flavor = await this.prisma.dishFlavor.findUnique({
      where: { id },
      include: {
        dish: true,
      },
    });
    if (!flavor) {
      throw new NotFoundException(`菜品口味 ID ${id} 不存在`);
    }
    return flavor;
  }

  async create(data: {
    dishId: number;
    name: string;
    value: string;
  }) {
    return this.prisma.dishFlavor.create({
      data,
      include: {
        dish: true,
      },
    });
  }

  async update(
    id: number,
    data: {
      dishId?: number;
      name?: string;
      value?: string;
    },
  ) {
    await this.findOne(id);
    return this.prisma.dishFlavor.update({
      where: { id },
      data,
      include: {
        dish: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.dishFlavor.delete({
      where: { id },
    });
  }
}
