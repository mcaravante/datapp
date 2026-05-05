import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../queue/queue.constants';
import { CustomerGroupsController } from './customer-groups.controller';
import { CustomerGroupsService } from './customer-groups.service';
import {
  CustomerGroupsProcessor,
  CustomerGroupsScheduler,
} from './customer-groups.scheduler';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.customerGroupsSync })],
  controllers: [CustomerGroupsController],
  providers: [
    CustomerGroupsService,
    CustomerGroupsScheduler,
    CustomerGroupsProcessor,
  ],
  exports: [CustomerGroupsService],
})
export class CustomerGroupsModule {}
