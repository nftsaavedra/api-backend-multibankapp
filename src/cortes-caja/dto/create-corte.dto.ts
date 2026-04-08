import { IsNumber, IsOptional, IsEnum, IsDate, Min, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoCorte } from '@prisma/client';

export class CreateCorteDto {
  @IsEnum(TipoCorte)
  tipoCorte: TipoCorte;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  saldoEfectivoDeclarado: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  saldoDigitalDeclarado: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  excedenteComision: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  operacionesKasnet: number;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaInicioBloque?: Date;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  esCorreccion?: boolean;

  @IsString()
  @IsOptional()
  motivoCorreccion?: string;
}
