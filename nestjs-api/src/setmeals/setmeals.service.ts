import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateSetmealDto } from './dto/create-setmeal.dto';
import { UpdateSetmealDto } from './dto/update-setmeal.dto';

@Injectable()
export class SetmealsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, name?: string, categoryId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (name) where.name = { contains: name };
    if (categoryId) where.categoryId = categoryId;

    const [data, total] = await Promise.all([
      this.prisma.setmeal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createTime: 'desc' },
        include: {
          category: true,
          setmealDishes: true,
        },
      }),
      this.prisma.setmeal.count({ where }),
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
    const setmeal = await this.prisma.setmeal.findUnique({
      where: { id },
      include: {
        category: true,
        setmealDishes: {
          include: {
            dish: true,
          },
        },
      },
    });
    if (!setmeal) {
      throw new NotFoundException(`套餐 ID ${id} 不存在`);
    }
    return setmeal;
  }

  async create(data: CreateSetmealDto) {
    const existing = await this.prisma.setmeal.findFirst({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictException('套餐名称已存在');
    }
    return this.prisma.setmeal.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        price: Number(data.price),
        description: data.description,
        image: data.image,
        sort: data.sort ?? 0,
        status: 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
      include: {
        category: true,
        setmealDishes: true,
      },
    });
  }

  async update(id: number, data: UpdateSetmealDto) {
    await this.findOne(id);
    const updateData: Record<string, unknown> = { updateTime: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.price !== undefined) updateData.price = Number(data.price);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.sort !== undefined) updateData.sort = data.sort;
    return this.prisma.setmeal.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        setmealDishes: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.setmeal.delete({
      where: { id },
    });
  }
}
