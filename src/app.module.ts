import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { MovimientosModule } from './movimientos/movimientos.module';
import { CortesCajaModule } from './cortes-caja/cortes-caja.module';
import { SyncModule } from './sync/sync.module';
import { EntidadesFinancierasModule } from './entidades-financieras/entidades-financieras.module';
import { CronjobsModule } from './cronjobs/cronjobs.module';
import { SetupModule } from './setup/setup.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minuto
        limit: 100, // 100 peticiones por minuto
      },
      {
        name: 'auth',
        ttl: 60000, // 1 minuto
        limit: 5,   // 5 intentos por minuto para auth
      },
    ]),
    CoreModule,
    AuthModule,
    MovimientosModule,
    CortesCajaModule,
    SyncModule,
    EntidadesFinancierasModule,
    CronjobsModule,
    SetupModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
