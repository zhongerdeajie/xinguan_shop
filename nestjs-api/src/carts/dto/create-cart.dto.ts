import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCartDto {
  @ApiProperty({ required: false, example: 1, description: '菜品 id' })
  @IsOptional()
  @IsInt()
  dishId?: number;

  @ApiProperty({ required: false, example: 1, description: '套餐 id' })
  @IsOptional()
  @IsInt()
  setmealId?: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  number: number;

  @ApiProperty({ required: false, example: '微辣' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dishFlavor?: string;
}