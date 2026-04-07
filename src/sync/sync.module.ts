import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { MovimientosModule } from '../movimientos/movimientos.module';

@Module({
  imports: [MovimientosModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
