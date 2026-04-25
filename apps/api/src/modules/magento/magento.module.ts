import { Global, Module } from '@nestjs/common';
import { MagentoStoreService } from './magento-store.service';

@Global()
@Module({
  providers: [MagentoStoreService],
  exports: [MagentoStoreService],
})
export class MagentoModule {}
