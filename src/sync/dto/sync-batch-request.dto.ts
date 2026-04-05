import {
  IsString,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SyncMovimientoDto } from './sync-movimiento.dto';

export class SyncBatchRequestDto {
  @IsUUID()
  operadorId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncMovimientoDto)
  movimientos: SyncMovimientoDto[];
}
