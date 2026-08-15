import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class CreateSetmealDishDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  setmealId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  dishId: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  copies: number;

  @ApiProperty({ required: false, example: '38.00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  price?: string;
}