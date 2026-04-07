import { IsString, IsOptional, IsDecimal, IsBoolean, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEntidadDto {
  @IsString()
  @MinLength(2)
  tipo: string;

  @IsString()
  @MinLength(2)
  nombre: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @Type(() => String)
  saldoInicial: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activo?: boolean;
}

export class UpdateEntidadDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  tipo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activo?: boolean;
}
