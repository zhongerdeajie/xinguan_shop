import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: '李四' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @ApiProperty({ required: false, example: '13800000001' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/avatar.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @ApiProperty({ required: false, example: '1', description: '1 男 2 女' })
  @IsOptional()
  @IsString()
  sex?: string;
}