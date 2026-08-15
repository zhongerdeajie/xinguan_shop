import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  Matches,
  IsIn,
  MaxLength,
} from 'class-validator';

/**
 * 创建员工入参。
 *
 * class-validator 装饰器在 main.ts 的全局 ValidationPipe 下生效：
 *   - whitelist  : 多余字段自动剔除
 *   - transform  : 自动把 JSON 转为 DTO 实例
 * 校验失败返回 400 + 字段错误明细，对前端和 Swagger 都可读。
 */
export class CreateEmployeeDto {
  @ApiProperty({ example: 'zhangsan', description: '登录用户名（3-20 位字母数字下划线）' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名只能包含字母、数字、下划线' })
  username: string;

  @ApiProperty({ example: 'P@ssw0rd!', description: '明文密码（≥6 位）' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password: string;

  @ApiProperty({ example: '张三', description: '姓名' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '13800000000', required: false, description: '手机号' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @ApiProperty({ example: '1', required: false, description: '性别：1 男 2 女' })
  @IsOptional()
  @IsString()
  @IsIn(['1', '2'])
  sex?: string;

  @ApiProperty({ example: '110101199001011234', required: false, description: '身份证号' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  idNumber?: string;

  @ApiProperty({ example: 1, required: false, description: '账号状态：1 启用 0 禁用' })
  @IsOptional()
  status?: number;
}