import { Module } from '@nestjs/common';
import { CortesCajaController } from './cortes-caja.controller';
import { CortesCajaService } from './cortes-caja.service';

@Module({
  controllers: [CortesCajaController],
  providers: [CortesCajaService]
})
export class CortesCajaModule {}
