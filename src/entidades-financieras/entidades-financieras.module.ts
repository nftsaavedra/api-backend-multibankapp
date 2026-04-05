import { Module } from '@nestjs/common';
import { EntidadesFinancierasController } from './entidades-financieras.controller';
import { EntidadesFinancierasService } from './entidades-financieras.service';

@Module({
  controllers: [EntidadesFinancierasController],
  providers: [EntidadesFinancierasService]
})
export class EntidadesFinancierasModule {}
