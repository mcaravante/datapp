import { Global, Module } from '@nestjs/common';
import { MagentoStoreService } from './magento-store.service';
import { MagentoClientFactory } from './magento-client.factory';

@Global()
@Module({
  providers: [MagentoStoreService, MagentoClientFactory],
  exports: [MagentoStoreService, MagentoClientFactory],
})
export class MagentoModule {}
