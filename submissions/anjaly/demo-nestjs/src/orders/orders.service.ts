import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  private orders: any[] = [];

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async findOrdersForUser(userId: string) {
    return this.orders.filter((o) => o.userId === userId);
  }

  async cancelOrder(orderId: string) {
    this.orders = this.orders.filter((o) => o.id !== orderId);
    return { cancelled: true };
  }

  async createOrder(userId: string, items: any[]) {
    const user = await this.usersService.findUser(userId);
    const order = { id: Math.random().toString(36).slice(2), userId, items, user };
    this.orders.push(order);
    return order;
  }
}
