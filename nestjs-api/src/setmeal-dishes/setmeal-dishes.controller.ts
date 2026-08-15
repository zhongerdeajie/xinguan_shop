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
import { CreateSetmealDishDto, UpdateSetmealDishDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SetmealDishesService } from './setmeal-dishes.service';

@ApiTags('套餐菜品关联管理')
@Controller('setmeal-dishes')
export class SetmealDishesController {
  constructor(private readonly setmealDishesService: SetmealDishesService) {}

  @Get()
  @ApiOperation({ summary: '获取套餐菜品关联列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('setmealId') setmealId?: string,
    @Query('dishId') dishId?: string,
  ) {
    return this.setmealDishesService.findAll(
      +page,
      +limit,
      setmealId ? +setmealId : undefined,
      dishId ? +dishId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取套餐菜品关联详情' })
  async findOne(@Param('id') id: string) {
    return this.setmealDishesService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建套餐菜品关联' })
  async create(@Body() createSetmealDishDto: CreateSetmealDishDto) {
    return this.setmealDishesService.create(createSetmealDishDto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新套餐菜品关联' })
  async update(@Param('id') id: string, @Body() updateSetmealDishDto: UpdateSetmealDishDto) {
    return this.setmealDishesService.update(+id, updateSetmealDishDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除套餐菜品关联' })
  async remove(@Param('id') id: string) {
    return this.setmealDishesService.remove(+id);
  }
}
