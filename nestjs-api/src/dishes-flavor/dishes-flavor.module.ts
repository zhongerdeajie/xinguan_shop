import { Module } from '@nestjs/common';
import { DishesFlavorController } from './dishes-flavor.controller';
import { DishesFlavorService } from './dishes-flavor.service';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DishesFlavorController],
  providers: [DishesFlavorService],
  exports: [DishesFlavorService],
})
export class DishesFlavorModule {}
