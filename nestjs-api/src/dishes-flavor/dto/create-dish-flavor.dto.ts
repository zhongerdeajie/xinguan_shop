import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDishFlavorDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  dishId: number;

  @ApiProperty({ example: '辣度' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name: string;

  @ApiProperty({ example: '["微辣","中辣","重辣"]', description: 'JSON 字符串数组' })
  @IsString()
  value: string;
}