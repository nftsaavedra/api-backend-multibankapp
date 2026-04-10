import { IsString, IsEnum, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { RolUsuario } from '@prisma/client';

export class CreateUsuarioDto {
  @IsString()
  @MinLength(4)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(RolUsuario)
  rol: RolUsuario;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
