import { PartialType } from '@nestjs/swagger';
import { CreateDishFlavorDto } from './create-dish-flavor.dto';

export class UpdateDishFlavorDto extends PartialType(CreateDishFlavorDto) {}