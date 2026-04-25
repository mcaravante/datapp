import { Global, Module } from '@nestjs/common';
import { RegionResolverService } from './region-resolver.service';

@Global()
@Module({
  providers: [RegionResolverService],
  exports: [RegionResolverService],
})
export class GeoModule {}
