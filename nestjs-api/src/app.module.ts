import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { EmployeesModule } from './employees/employees.module';
import { CategoriesModule } from './categories/categories.module';
import { DishesModule } from './dishes/dishes.module';
import { DishesFlavorModule } from './dishes-flavor/dishes-flavor.module';
import { SetmealsModule } from './setmeals/setmeals.module';
import { SetmealDishesModule } from './setmeal-dishes/setmeal-dishes.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { CartsModule } from './carts/carts.module';
import { OrdersModule } from './orders/orders.module';
import { OrderDetailsModule } from './order-details/order-details.module';
import { AiModule } from './ai/ai.module';
import { VectorModule } from './vector/vector.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomerModule } from './customer/customer.module';
import { CouponModule } from './coupons/coupon.module';
import { RedisCacheModule } from './common/redis-cache.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisCacheModule,
    PrismaModule,
    AuthModule,
    EmployeesModule,
    CategoriesModule,
    DishesModule,
    DishesFlavorModule,
    SetmealsModule,
    SetmealDishesModule,
    UsersModule,
    AddressesModule,
    CartsModule,
    OrdersModule,
    OrderDetailsModule,
    AiModule,
    VectorModule,
    DashboardModule,
    CustomerModule,
    CouponModule,
  ],
})
export class AppModule {}
