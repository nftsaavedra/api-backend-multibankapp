import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { CurrentUserPayload } from '../core/current-user.decorator';
import { randomBytes } from 'crypto';

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: CurrentUserPayload;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  private async storeRefreshToken(
    token: string,
    usuarioId: string,
    expiresInDays: number = 7,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await this.prisma.refreshToken.create({
      data: {
        token,
        usuario_id: usuarioId,
        expires_at: expiresAt,
      },
    });
  }

  private async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked_at: new Date() },
    });
  }

  private async revokeAllUserTokens(usuarioId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuario_id: usuarioId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async validateRefreshToken(token: string): Promise<boolean> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!storedToken) return false;
    if (storedToken.revoked_at) return false;
    if (new Date() > storedToken.expires_at) return false;

    return true;
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { username: dto.username },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await argon2.verify(
      usuario.password_hash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: CurrentUserPayload = {
      userId: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '8h' });
    const refresh_token = this.generateRefreshToken();

    // Revocar tokens anteriores y guardar nuevo
    await this.revokeAllUserTokens(usuario.id);
    await this.storeRefreshToken(refresh_token, usuario.id);

    return {
      access_token,
      refresh_token,
      user: payload,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    // Validar token contra DB
    const isValid = await this.validateRefreshToken(refreshToken);
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

    // Generar nuevos tokens
    const access_token = this.jwtService.sign(newPayload, { expiresIn: '8h' });
    const new_refresh_token = this.generateRefreshToken();

    // Revocar token anterior y guardar nuevo
    await this.revokeRefreshToken(refreshToken);
    await this.storeRefreshToken(new_refresh_token, usuario.id);

    return {
      access_token,
      refresh_token: new_refresh_token,
      user: newPayload,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.revokeRefreshToken(refreshToken);
  }

  async logoutAll(usuarioId: string): Promise<void> {
    await this.revokeAllUserTokens(usuarioId);
  }
}
