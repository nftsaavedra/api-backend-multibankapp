import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Lima';

@Injectable()
export class DateTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transformDates(data)));
  }

  private transformDates(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (data instanceof Date) {
      return DateTime.fromJSDate(data)
        .setZone(TIMEZONE)
        .toFormat('yyyy-MM-dd HH:mm:ss');
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.transformDates(item));
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.transformDates(value);
      }
      return result;
    }

    return data;
  }
}
