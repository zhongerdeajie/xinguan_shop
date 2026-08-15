import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: '热销' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name: string;

  @ApiProperty({ example: 1, description: '1 菜品分类 2 套餐分类' })
  @IsInt()
  type: number;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  status?: number;
}