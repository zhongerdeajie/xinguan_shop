import { PartialType } from '@nestjs/swagger';
import { CreateSetmealDto } from './create-setmeal.dto';

export class UpdateSetmealDto extends PartialType(CreateSetmealDto) {}