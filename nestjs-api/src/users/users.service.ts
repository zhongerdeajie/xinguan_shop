import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const where = { deletedAt: null }; // 软删过滤
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take: limit, orderBy: { createTime: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async findOne(id: number) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } }); // 软删过滤
  }

  async update(id: number, data: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async remove(id: number) {
    // 软删
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
