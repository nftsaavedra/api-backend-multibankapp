import { Module, Global } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { DateTransformInterceptor } from './date-transform.interceptor';

@Global()
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DateTransformInterceptor,
    },
  ],
  exports: [],
})
export class CoreModule {}
