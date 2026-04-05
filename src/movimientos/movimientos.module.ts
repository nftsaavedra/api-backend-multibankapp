import { Module } from '@nestjs/common';
import { MovimientosController } from './movimientos.controller';
import { MovimientosService } from './movimientos.service';

@Module({
  controllers: [MovimientosController],
  providers: [MovimientosService]
})
export class MovimientosModule {}
