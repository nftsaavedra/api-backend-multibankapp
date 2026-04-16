import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { CurrentUserPayload } from '../core/current-user.decorator';
import { RolUsuario } from '@prisma/client';
import { AUTH } from '../core/constants';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { IsString, MinLength, MaxLength, Min } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(AUTH.MIN_PASSWORD_LENGTH)
  @MaxLength(100)
  newPassword: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: CurrentUserPayload;
}

/**
 * Servicio de Autenticación - Orquestador
 * SRP: Coordina los servicios de tokens y passwords para autenticación
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Validar credenciales usando PasswordService
    const validation = await this.passwordService.validateCredentials(dto.username, dto.password);

    if (!validation.valid || !validation.user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const usuario = validation.user;
    const payload: CurrentUserPayload = {
      userId: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
    };

    // Generar tokens usando TokenService
    const access_token = this.tokenService.generateAccessToken(payload);
    const refresh_token = this.tokenService.generateRefreshToken();

    // Revocar tokens anteriores y guardar nuevo
    await this.tokenService.revokeAllUserTokens(usuario.id);
    await this.tokenService.storeRefreshToken(refresh_token, usuario.id);

    return {
      access_token,
      refresh_token,
      user: payload,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    // Validar token usando TokenService
    const isValid = await this.tokenService.validateRefreshToken(refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Token de refresco inválido o revocado');
    }

    // Obtener token de DB para extraer usuario
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Token no encontrado');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: storedToken.usuario_id },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no válido');
    }

    const newPayload: CurrentUserPayload = {
      userId: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
    };

    // Generar nuevos tokens usando TokenService
    const access_token = this.tokenService.generateAccessToken(newPayload);
    const new_refresh_token = this.tokenService.generateRefreshToken();

    // Rotar tokens usando TokenService
    await this.tokenService.rotateRefreshToken(refreshToken, usuario.id);

    return {
      access_token,
      refresh_token: new_refresh_token,
      user: newPayload,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  async logoutAll(usuarioId: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(usuarioId);
  }

  /**
   * Cambio de password con validación de password actual
   * Revoca todas las sesiones activas por seguridad
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    // Validar password actual usando PasswordService
    const isCurrentPasswordValid = await this.passwordService.validateCurrentPassword(
      userId,
      dto.currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    // Validar que el nuevo password no sea igual al actual
    const isSamePassword = await this.passwordService.verifyPassword(
      dto.currentPassword,
      dto.newPassword,
    ).catch(() => false);

    // Verificar que no sea la misma contraseña
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    // Actualizar password usando PasswordService
    await this.passwordService.updatePassword(userId, dto.newPassword);

    // Revocar todas las sesiones activas por seguridad
    await this.tokenService.revokeAllUserTokens(userId);

    return {
      success: true,
      message: 'Contraseña actualizada exitosamente. Debe volver a iniciar sesión.',
    };
  }
}
