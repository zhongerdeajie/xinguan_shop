import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateSetmealDishDto } from './dto/create-setmeal-dish.dto';
import { UpdateSetmealDishDto } from './dto/update-setmeal-dish.dto';

@Injectable()
export class SetmealDishesService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, setmealId?: number, dishId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (setmealId) where.setmealId = setmealId;
    if (dishId) where.dishId = dishId;

    const [data, total] = await Promise.all([
      this.prisma.setmealDish.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
        include: {
          setmeal: true,
          dish: true,
        },
      }),
      this.prisma.setmealDish.count({ where }),
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
    const setmealDish = await this.prisma.setmealDish.findUnique({
      where: { id },
      include: {
        setmeal: true,
        dish: true,
      },
    });
    if (!setmealDish) {
      throw new NotFoundException(`套餐菜品关联 ID ${id} 不存在`);
    }
    return setmealDish;
  }

  async create(data: CreateSetmealDishDto) {
    const payload: Record<string, unknown> = {
      setmealId: data.setmealId,
      dishId: data.dishId,
      copies: data.copies,
      sort: 0,
    };
    if (data.price !== undefined) payload.price = Number(data.price);
    return this.prisma.setmealDish.create({
      data: payload,
      include: {
        setmeal: true,
        dish: true,
      },
    });
  }

  async update(id: number, data: UpdateSetmealDishDto) {
    await this.findOne(id);
    const updateData: Record<string, unknown> = {};
    if (data.setmealId !== undefined) updateData.setmealId = data.setmealId;
    if (data.dishId !== undefined) updateData.dishId = data.dishId;
    if (data.copies !== undefined) updateData.copies = data.copies;
    if (data.price !== undefined) updateData.price = Number(data.price);
    return this.prisma.setmealDish.update({
      where: { id },
      data: updateData,
      include: {
        setmeal: true,
        dish: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.setmealDish.delete({
      where: { id },
    });
  }
}
