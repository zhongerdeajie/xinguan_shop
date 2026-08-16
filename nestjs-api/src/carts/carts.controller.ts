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
} from '@nestjs/common';
import { CreateCartDto, UpdateCartDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CartsService } from './carts.service';
import { CustomerAuthGuard } from '../auth/customer-auth.guard';

@ApiTags('购物车管理')
@UseGuards(CustomerAuthGuard)
@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @ApiOperation({ summary: '获取购物车列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('userId') userId?: string,
  ) {
    return this.cartsService.findAll(
      +page,
      +limit,
      userId ? +userId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取购物车项详情' })
  async findOne(@Param('id') id: string) {
    return this.cartsService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建购物车项' })
  async create(
    @Body() createCartDto: CreateCartDto,
    @Req() req: any,
  ) {
    const userId = Number(req?.user?.userId ?? req?.user?.id ?? 0);
    return this.cartsService.create({
      ...createCartDto,
      userId,
      name: createCartDto.dishId ? `菜品 ${createCartDto.dishId}` : `套餐 ${createCartDto.setmealId}`,
      amount: 0,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新购物车项' })
  async update(@Param('id') id: string, @Body() updateCartDto: UpdateCartDto) {
    return this.cartsService.update(+id, updateCartDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除购物车项' })
  async remove(@Param('id') id: string) {
    return this.cartsService.remove(+id);
  }

  @Delete('clear/:userId')
  @ApiOperation({ summary: '清空用户购物车' })
  async clear(@Param('userId') userId: string) {
    return this.cartsService.clearByUserId(+userId);
  }
}
