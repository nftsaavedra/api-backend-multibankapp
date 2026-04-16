import { Module } from '@nestjs/common';
import { CortesCajaController } from './cortes-caja.controller';
import { CortesCajaService } from './cortes-caja.service';
import { BalanceAdjusterService } from './balance-adjuster.service';
import { CorteSequenceValidatorService } from './corte-sequence-validator.service';
import { CorteBalanceProcessorService } from './corte-balance-processor.service';

@Module({
  controllers: [CortesCajaController],
  providers: [
    CortesCajaService,
    BalanceAdjusterService,
    CorteSequenceValidatorService,
    CorteBalanceProcessorService,
  ],
  exports: [CortesCajaService],
})
export class CortesCajaModule {}
