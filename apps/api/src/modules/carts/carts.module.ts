import { Module } from '@nestjs/common';
import { MagentoModule } from '../magento/magento.module';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';

@Module({
  imports: [MagentoModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
