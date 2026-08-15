import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  consignee: string;

  @ApiProperty({ example: '13800000000' })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @ApiProperty({ required: false, example: '上海市' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provinceName?: string;

  @ApiProperty({ required: false, example: '上海市' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cityName?: string;

  @ApiProperty({ required: false, example: '浦东新区' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  districtName?: string;

  @ApiProperty({ required: false, example: '世纪大道1号' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @ApiProperty({ required: false, example: 0, description: '0 非默认 1 默认' })
  @IsOptional()
  @IsInt()
  isDefault?: number;
}