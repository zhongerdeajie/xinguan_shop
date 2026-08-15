import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';

// 简单内存缓存：菜单接口 15 秒内不重复查库（管理端改价/增删时清空）
const menuCache = new Map<string, { time: number; data: any }>();
async function cached(key: string, ttlMs: number, fn: () => Promise<any>) {
  const hit = menuCache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.data;
  const data = await fn();
  menuCache.set(key, { time: Date.now(), data });
  return data;
}

@Injectable()
export class DishesService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, name?: string, categoryId?: number) {
    const key = `dishes:${page}:${limit}:${name || ''}:${categoryId || ''}`;
    return cached(key, 15000, async () => {
      const skip = (page - 1) * limit;
      const where: any = {};
      if (name) where.name = { contains: name };
      if (categoryId) where.categoryId = categoryId;

      const [data, total] = await Promise.all([
        this.prisma.dish.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createTime: 'desc' },
          include: {
            category: true,
            flavors: true,
          },
        }),
        this.prisma.dish.count({ where }),
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
    });
  }

  async findOne(id: number) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      include: {
        category: true,
        flavors: true,
      },
    });
    if (!dish) {
      throw new NotFoundException(`菜品 ID ${id} 不存在`);
    }
    return dish;
  }

  async create(data: CreateDishDto) {
    const existing = await this.prisma.dish.findFirst({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictException('菜品名称已存在');
    }
    const result = await this.prisma.dish.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        price: Number(data.price),
        image: data.image,
        description: data.description,
        status: data.status ?? 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
    });
    return this.prisma.dish.findUnique({
      where: { id: result.id },
      include: {
        category: true,
        flavors: true,
      },
    });
  }

  async update(id: number, data: UpdateDishDto) {
    await this.findOne(id);
    const updateData: Record<string, unknown> = { updateTime: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.price !== undefined) updateData.price = Number(data.price);
    if (data.image !== undefined) updateData.image = data.image;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    return this.prisma.dish.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        flavors: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.dish.delete({
      where: { id },
    });
  }
}
