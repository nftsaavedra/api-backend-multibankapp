import {
  IsOptional,
  IsDate,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FindCortesFiltersDto {
  @IsUUID()
  @IsOptional()
  operadorId?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaDesde?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  fechaHasta?: Date;
}
