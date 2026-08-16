import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number, limit: number, userId?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.addressBook.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isDefault: 'desc' }, { createTime: 'desc' }],
        include: {
          user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
        },
      }),
      this.prisma.addressBook.count({ where }),
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
    const address = await this.prisma.addressBook.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
      },
    });
    if (!address) {
      throw new NotFoundException(`地址 ID ${id} 不存在`);
    }
    return address;
  }

  async create(data: CreateAddressDto & { userId: number; createUser?: number }) {
    if (data.isDefault === 1) {
      await this.prisma.addressBook.updateMany({
        where: { userId: data.userId },
        data: { isDefault: 0 },
      });
    }
    return this.prisma.addressBook.create({
      data: {
        userId: data.userId,
        consignee: data.consignee,
        phone: data.phone,
        provinceName: data.provinceName,
        cityName: data.cityName,
        districtName: data.districtName,
        detail: data.detail,
        isDefault: data.isDefault ?? 0,
        createTime: new Date(),
        updateTime: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
      },
    });
  }

  async update(id: number, data: UpdateAddressDto) {
    await this.findOne(id);
    if (data.isDefault === 1) {
      const address = await this.prisma.addressBook.findUnique({ where: { id } });
      if (address) {
        await this.prisma.addressBook.updateMany({
          where: { userId: address.userId, id: { not: id } },
          data: { isDefault: 0 },
        });
      }
    }
    return this.prisma.addressBook.update({
      where: { id },
      data: {
        ...data,
        updateTime: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, avatar: true, sex: true } },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.addressBook.delete({
      where: { id },
    });
  }
}
