import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { MovimientosModule } from './movimientos/movimientos.module';
import { CortesCajaModule } from './cortes-caja/cortes-caja.module';
import { SyncModule } from './sync/sync.module';
import { EntidadesFinancierasModule } from './entidades-financieras/entidades-financieras.module';
import { CronjobsModule } from './cronjobs/cronjobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CoreModule,
    AuthModule,
    MovimientosModule,
    CortesCajaModule,
    SyncModule,
    EntidadesFinancierasModule,
    CronjobsModule,
  ],
})
export class AppModule {}
