import { Module } from '@nestjs/common';
import { SetmealDishesController } from './setmeal-dishes.controller';
import { SetmealDishesService } from './setmeal-dishes.service';
import { PrismaModule } from '../common/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SetmealDishesController],
  providers: [SetmealDishesService],
  exports: [SetmealDishesService],
})
export class SetmealDishesModule {}
