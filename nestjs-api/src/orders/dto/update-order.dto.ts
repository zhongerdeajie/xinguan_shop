import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderDto {
  @ApiProperty({ required: false, example: '地址修改' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cancelReason?: string;

  @ApiProperty({ required: false, example: 6, description: '订单状态码' })
  @IsOptional()
  @IsInt()
  status?: number;
}