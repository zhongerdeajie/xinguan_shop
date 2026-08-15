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
} from '@nestjs/common';
import { CreateAddressDto, UpdateAddressDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';

@ApiTags('地址管理')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: '获取地址列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('userId') userId?: string,
  ) {
    return this.addressesService.findAll(
      +page,
      +limit,
      userId ? +userId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取地址详情' })
  async findOne(@Param('id') id: string) {
    return this.addressesService.findOne(+id);
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
  async update(@Param('id') id: string, @Body() updateAddressDto: UpdateAddressDto) {
    return this.addressesService.update(+id, updateAddressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除地址' })
  async remove(@Param('id') id: string) {
    return this.addressesService.remove(+id);
  }
}
