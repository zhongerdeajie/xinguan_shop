import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  addressBookId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  payMethod: number;

  @ApiProperty({ required: false, example: '少辣' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  remark?: string;
}