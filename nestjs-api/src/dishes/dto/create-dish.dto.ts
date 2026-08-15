import { ApiProperty } from '@nestjs/swagger';
import {
  IsDecimal,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDishDto {
  @ApiProperty({ example: '宫保鸡丁' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name: string;

  @ApiProperty({ example: 1, description: '分类 id' })
  @IsInt()
  categoryId: number;

  @ApiProperty({ example: '38.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: '价格格式不正确（最多 2 位小数）' })
  price: string;

  @ApiProperty({ required: false, example: 'https://example.com/dish.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image?: string;

  @ApiProperty({ required: false, example: '招牌菜' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  status?: number;
}