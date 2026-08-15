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
import { CreateSetmealDto, UpdateSetmealDto } from './dto';

import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SetmealsService } from './setmeals.service';

@ApiTags('套餐管理')
@Controller('setmeals')
export class SetmealsController {
  constructor(private readonly setmealsService: SetmealsService) {}

  @Get()
  @ApiOperation({ summary: '获取套餐列表' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('name') name?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.setmealsService.findAll(
      +page,
      +limit,
      name,
      categoryId ? +categoryId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取套餐详情' })
  async findOne(@Param('id') id: string) {
    return this.setmealsService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建套餐' })
  async create(@Body() createSetmealDto: CreateSetmealDto) {
    return this.setmealsService.create(createSetmealDto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新套餐' })
  async update(@Param('id') id: string, @Body() updateSetmealDto: UpdateSetmealDto) {
    return this.setmealsService.update(+id, updateSetmealDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除套餐' })
  async remove(@Param('id') id: string) {
    return this.setmealsService.remove(+id);
  }
}
