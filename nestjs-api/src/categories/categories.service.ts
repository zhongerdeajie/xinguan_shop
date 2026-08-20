import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// 简单内存缓存：分类接口 15 秒内不重复查库
const categoryCache = new Map<string, { time: number; data: any }>();
async function cached(key: string, ttlMs: number, fn: () => Promise<any>) {
  const hit = categoryCache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.data;
  const data = await fn();
  categoryCache.set(key, { time: Date.now(), data });
  return data;
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, type?: number, name?: string) {
    const key = `categories:${page}:${limit}:${type || ''}:${name || ''}`;
    return cached(key, 15000, async () => {
      const skip = (page - 1) * limit;
      const where: any = { deletedAt: null }; // 软删过滤
      if (type) where.type = type;
      if (name) where.name = { contains: name };

      const [data, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.category.count({ where }),
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
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null }, // 软删过滤
      include: {
        dishes: true,
        setmeals: true,
      },
    });
    if (!category) {
      throw new NotFoundException(`分类 ID ${id} 不存在`);
    }
    return category;
  }

  async create(data: {
    type: number;
    name: string;
    sort?: number;
    status?: number;
    createUser?: number;
  }) {
    const existing = await this.prisma.category.findFirst({
      where: { name: data.name, type: data.type },
    });
    if (existing) {
      throw new ConflictException('分类名称已存在');
    }
    return this.prisma.category.create({
      data: {
        ...data,
        sort: data.sort ?? 0,
        status: data.status ?? 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
    });
  }

  async update(
    id: number,
    data: {
      type?: number;
      name?: string;
      sort?: number;
      status?: number;
      updateUser?: number;
    },
  ) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...data,
        updateTime: new Date(),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    // 软删
    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
