import { PartialType } from '@nestjs/swagger';
import { CreateSetmealDishDto } from './create-setmeal-dish.dto';

export class UpdateSetmealDishDto extends PartialType(CreateSetmealDishDto) {}