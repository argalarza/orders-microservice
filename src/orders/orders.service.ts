import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';
import { HttpService } from '@nestjs/axios';
import { OrderWithProducts } from './interfaces/order-with-produts.interface';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(private readonly httpService: HttpService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  // Crear una nueva orden
  async create(createOrderDto: CreateOrderDto) {
    try {
      // 1. Confirmar los IDs de los productos con una solicitud HTTP al servicio de productos
      const productIds = createOrderDto.items.map((item) => item.productId);
      const { data: products } = await firstValueFrom(
        this.httpService.post('http://3.94.206.81:3001/products', { productIds })
      );

      if (!products || products.length === 0) {
        throw new Error('Productos no válidos');
      }

      // 2. Cálculos de los valores (totalAmount y totalItems)
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const product = products.find((p) => p.id === orderItem.productId);
        return product ? acc + (product.price * orderItem.quantity) : acc;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => acc + orderItem.quantity, 0);

      // 3. Crear una transacción de base de datos (orden)
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find((product) => product.id === orderItem.productId)?.price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      // Añadir nombres de productos al objeto de la orden
      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)?.name,
        })),
      };
    } catch (error) {
      this.logger.error(error);
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error al crear la orden, revisa los logs.',
      });
    }
  }

  // Obtener todas las órdenes con paginación
  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: { status: orderPaginationDto.status },
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: { status: orderPaginationDto.status },
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      },
    };
  }

  // Obtener una orden por su ID
  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Orden con id ${id} no encontrada`,
      });
    }

    // Obtener productos asociados a la orden
    const productIds = order.OrderItem.map((orderItem) => orderItem.productId);
    const { data: products } = await firstValueFrom(
      this.httpService.post('http://3.94.206.81:3001/products', { productIds })
    );

    // Devolver la orden con los productos y sus nombres
    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)?.name,
      })),
    };
  }

  // Cambiar el estado de una orden
  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);
    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status: status },
    });
  }

  // Crear una sesión de pago (aquí estamos haciendo una solicitud HTTP al servicio de pagos)
  async createPaymentSession(order: OrderWithProducts) {
    const { data: paymentSession } = await firstValueFrom(
      this.httpService.post('http://payment-service/create-payment-session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      })
    );

    return paymentSession;
  }

  // Confirmar el pago de la orden
  async paidOrder(paidOrderDto: PaidOrderDto) {
    this.logger.log('Order Paid');
    this.logger.log(paidOrderDto);

    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,

        // La relación con la recepción de la orden
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    });

    return order;
  }
}
