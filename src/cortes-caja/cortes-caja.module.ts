import { Module } from '@nestjs/common';
import { CortesCajaController } from './cortes-caja.controller';
import { CortesCajaService } from './cortes-caja.service';
import { BalanceAdjusterService } from './balance-adjuster.service';

@Module({
  controllers: [CortesCajaController],
  providers: [CortesCajaService, BalanceAdjusterService],
  exports: [CortesCajaService],
})
export class CortesCajaModule {}
