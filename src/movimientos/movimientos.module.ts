import { Module } from '@nestjs/common';
import { MovimientosController } from './movimientos.controller';
import { MovimientosService } from './movimientos.service';
import { MovementValidatorService } from './movement-validator.service';

@Module({
  controllers: [MovimientosController],
  providers: [MovimientosService, MovementValidatorService],
  exports: [MovimientosService],
})
export class MovimientosModule {}
