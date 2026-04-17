import { IsNumber, IsOptional, IsEnum, IsDate, Min, IsBoolean, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoCorte } from '@prisma/client';

class EntidadSaldoDto {
  @IsString()
  entidadId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  saldoDeclarado: number;
}

export class CreateCorteDto {
  @IsEnum(TipoCorte)
  tipoCorte: TipoCorte;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntidadSaldoDto)
  saldosEntidades: EntidadSaldoDto[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  excedenteComision: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  operacionesKasnet?: number;

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
