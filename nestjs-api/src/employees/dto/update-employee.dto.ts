import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeDto } from './create-employee.dto';

/**
 * 更新员工入参：CreateEmployeeDto 的所有字段都变成可选。
 * PartialType 让 Swagger 能正确推断出“全字段可选”的 schema。
 */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}