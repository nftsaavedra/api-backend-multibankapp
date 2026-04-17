import { Module } from '@nestjs/common';
import { CortesCajaController } from './cortes-caja.controller';
import { CortesCajaService } from './cortes-caja.service';
import { CorteSequenceValidatorService } from './corte-sequence-validator.service';
import { CorteBalanceProcessorService } from './corte-balance-processor.service';

@Module({
  controllers: [CortesCajaController],
  providers: [
    CortesCajaService,
    CorteSequenceValidatorService,
    CorteBalanceProcessorService,
  ],
  exports: [CortesCajaService],
})
export class CortesCajaModule {}
