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
import { CreateDishDto, UpdateDishDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DishesService } from './dishes.service';

@ApiTags('菜品管理')
@Controller('dishes')
export class DishesController {
  constructor(private readonly dishesService: DishesService) {}

  @Get()
  @ApiOperation({ summary: '获取菜品列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('name') name?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.dishesService.findAll(
      +page,
      +limit,
      name,
      categoryId ? +categoryId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取菜品详情' })
  async findOne(@Param('id') id: string) {
    return this.dishesService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建菜品' })
  async create(@Body() createDishDto: CreateDishDto) {
    return this.dishesService.create(createDishDto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新菜品' })
  async update(@Param('id') id: string, @Body() updateDishDto: UpdateDishDto) {
    return this.dishesService.update(+id, updateDishDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除菜品' })
  async remove(@Param('id') id: string) {
    return this.dishesService.remove(+id);
  }
}
