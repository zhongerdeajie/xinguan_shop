import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCouponDto {
  @ApiProperty({ required: false, example: '满 100 减 20' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ required: false, example: '20.00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount?: string;

  @ApiProperty({ required: false, example: '100.00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  threshold?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  status?: number;
}