import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [HttpModule,OrdersModule],
})
export class OrdersModule {}
