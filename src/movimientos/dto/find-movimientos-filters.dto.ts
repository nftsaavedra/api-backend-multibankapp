import {
  IsString,
  IsOptional,
  IsEnum,
  IsDate,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoMovimiento, EstadoConciliacion } from '@prisma/client';

export class FindMovimientosFiltersDto {
  @IsUUID()
  @IsOptional()
  operadorId?: string;

  @IsUUID()
  @IsOptional()
  corteId?: string;

  @IsEnum(EstadoConciliacion)
  @IsOptional()
  estadoConciliacion?: EstadoConciliacion;

  @IsEnum(EstadoMovimiento)
  @IsOptional()
  estadoAprobacion?: EstadoMovimiento;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaDesde?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaHasta?: Date;
}
