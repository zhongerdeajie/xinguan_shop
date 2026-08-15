import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CreateDishFlavorDto, UpdateDishFlavorDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DishesFlavorService } from './dishes-flavor.service';

@ApiTags('菜品口味管理')
@Controller('dishes-flavor')
export class DishesFlavorController {
  constructor(private readonly dishesFlavorService: DishesFlavorService) {}

  @Get()
  @ApiOperation({ summary: '获取菜品口味列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('dishId') dishId?: string,
  ) {
    return this.dishesFlavorService.findAll(
      +page,
      +limit,
      dishId ? +dishId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取菜品口味详情' })
  async findOne(@Param('id') id: string) {
    return this.dishesFlavorService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建菜品口味' })
  async create(@Body() createDishFlavorDto: CreateDishFlavorDto) {
    return this.dishesFlavorService.create(createDishFlavorDto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新菜品口味' })
  async update(@Param('id') id: string, @Body() updateDishFlavorDto: UpdateDishFlavorDto) {
    return this.dishesFlavorService.update(+id, updateDishFlavorDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除菜品口味' })
  async remove(@Param('id') id: string) {
    return this.dishesFlavorService.remove(+id);
  }
}
