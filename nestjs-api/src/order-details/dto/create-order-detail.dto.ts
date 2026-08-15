import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDetailDto {
  @ApiProperty({ example: 1, description: '订单 id' })
  @IsInt()
  orderId: number;

  @ApiProperty({ example: '宫保鸡丁' })
  @IsString()
  @MaxLength(32)
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  number: number;

  @ApiProperty({ example: '38.00' })
  @IsString()
  amount: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  dishId?: number;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  setmealId?: number;
}