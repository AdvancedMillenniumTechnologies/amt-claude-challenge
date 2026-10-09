import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class UsersService {
  private users: Record<string, any> = {};

  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  async insertUser(data: any) {
    const id = Math.random().toString(36).slice(2);
    this.users[id] = { id, ...data };
    return this.users[id];
  }

  async findUser(id: string) {
    return this.users[id];
  }

  async deleteUser(id: string) {
    delete this.users[id];
    const orders = await this.ordersService.findOrdersForUser(id);
    for (const order of orders) {
      await this.ordersService.cancelOrder(order.id);
    }
    return { deleted: true };
  }
}
