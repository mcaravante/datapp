import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantAdminController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [TenantAdminController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
