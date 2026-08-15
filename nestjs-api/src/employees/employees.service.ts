import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, name?: string) {
    const skip = (page - 1) * limit;
    const where = name ? { name: { contains: name } } : {};
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createTime: 'desc' },
      }),
      this.prisma.employee.count({ where }),
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
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });
    if (!employee) {
      throw new NotFoundException(`员工 ID ${id} 不存在`);
    }
    return employee;
  }

  async create(data: {
    name: string;
    username: string;
    password: string;
    phone?: string;
    sex?: string;
    idNumber?: string;
    status?: number;
    createUser?: number;
  }) {
    const existing = await this.prisma.employee.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }
    return this.prisma.employee.create({
      data: {
        ...data,
        status: data.status ?? 1,
        createTime: new Date(),
        updateTime: new Date(),
      },
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      username?: string;
      password?: string;
      phone?: string;
      sex?: string;
      idNumber?: string;
      status?: number;
      updateUser?: number;
    },
  ) {
    await this.findOne(id);
    if (data.username) {
      const existing = await this.prisma.employee.findUnique({
        where: { username: data.username },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('用户名已存在');
      }
    }
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...data,
        updateTime: new Date(),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.employee.delete({
      where: { id },
    });
  }
}
