import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsUUID,
  Min,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMovimientoDto {
  @IsString()
  @Length(3, 255)
  concepto: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  monto: number;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  esGasto?: boolean;

  @IsUUID()
  cuentaOrigenId: string;

  @IsUUID()
  cuentaDestinoId: string;

  @IsString()
  @IsOptional()
  syncId?: string;
}
