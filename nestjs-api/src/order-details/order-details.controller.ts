import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateOrderDetailDto, UpdateOrderDetailDto } from './dto';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrderDetailsService } from './order-details.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('订单明细管理')
@Controller('order-details')
export class OrderDetailsController {
  constructor(private readonly orderDetailsService: OrderDetailsService) {}

  @Get()
  @ApiOperation({ summary: '获取订单明细列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('orderId') orderId?: string,
    @Query('dishId') dishId?: string,
    @Query('setmealId') setmealId?: string,
  ) {
    return this.orderDetailsService.findAll(
      +page,
      +limit,
      orderId ? +orderId : undefined,
      dishId ? +dishId : undefined,
      setmealId ? +setmealId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取订单明细详情' })
  async findOne(@Param('id') id: string) {
    return this.orderDetailsService.findOne(+id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建订单明细' })
  async create(@Body() createOrderDetailDto: CreateOrderDetailDto) {
    return this.orderDetailsService.create(createOrderDetailDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新订单明细' })
  async update(@Param('id') id: string, @Body() updateOrderDetailDto: UpdateOrderDetailDto) {
    return this.orderDetailsService.update(+id, updateOrderDetailDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除订单明细' })
  async remove(@Param('id') id: string) {
    return this.orderDetailsService.remove(+id);
  }
}
