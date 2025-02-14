import { Controller, Post, Get, Body, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';

@Controller('orders') // Definir la ruta base
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create') // Ruta para crear una orden
  async create(@Body() createOrderDto: CreateOrderDto) {
    const order = await this.ordersService.create(createOrderDto);
    const paymentSession = await this.ordersService.createPaymentSession(order);

    return {
      order,
      paymentSession,
    };
  }

  @Get() // Ruta para obtener todas las órdenes con paginación
  findAll(@Body() orderPaginationDto: OrderPaginationDto) {
    return this.ordersService.findAll(orderPaginationDto);
  }

  @Get(':id') // Ruta para obtener una orden por ID
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Put('status') // Ruta para cambiar el estado de una orden
  changeOrderStatus(@Body() changeOrderStatusDto: ChangeOrderStatusDto) {
    return this.ordersService.changeStatus(changeOrderStatusDto);
  }

  @Post('payment/succeeded') // Ruta para procesar cuando el pago haya sido realizado
  paidOrder(@Body() paidOrderDto: PaidOrderDto) {
    return this.ordersService.paidOrder(paidOrderDto);
  }
}
