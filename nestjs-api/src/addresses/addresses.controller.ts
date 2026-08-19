import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CreateAddressDto, UpdateAddressDto } from './dto';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';

@ApiTags('地址管理')
@UseGuards(CustomerAuthGuard)
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: '获取当前登录顾客的地址列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Req() req: any,
    @Query('userId') _userId?: string, // 保留参数兼容旧前端，但服务端忽略，强制用 token 中的 userId
  ) {
    const userId = Number(req?.user?.userId ?? 0);
    return this.addressesService.findAll(+page, +limit, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取地址详情' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const address = await this.addressesService.findOne(+id);
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (address.userId !== currentUserId) {
      throw new ForbiddenException('无权访问他人的地址');
    }
    return address;
  }

  @Post()
  @ApiOperation({ summary: '创建地址' })
  async create(@Body() createAddressDto: CreateAddressDto, @Req() req: any) {
    return this.addressesService.create({
      ...createAddressDto,
      userId: Number(req?.user?.userId ?? req?.user?.id ?? 0),
    });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新地址' })
  async update(@Param('id') id: string, @Body() updateAddressDto: UpdateAddressDto, @Req() req: any) {
    // 越权校验：只能改自己的地址
    const address = await this.addressesService.findOne(+id);
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (address.userId !== currentUserId) {
      throw new ForbiddenException('无权修改他人的地址');
    }
    return this.addressesService.update(+id, updateAddressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除地址' })
  async remove(@Param('id') id: string, @Req() req: any) {
    // 越权校验：只能删自己的地址
    const address = await this.addressesService.findOne(+id);
    const currentUserId = Number(req?.user?.userId ?? 0);
    if (address.userId !== currentUserId) {
      throw new ForbiddenException('无权删除他人的地址');
    }
    return this.addressesService.remove(+id);
  }
}
