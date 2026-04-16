import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { CurrentUserPayload } from '../core/current-user.decorator';
import { AUTH } from '../core/constants';
import { randomBytes } from 'crypto';

/**
 * Servicio de Gestión de Tokens
 * SRP: Maneja exclusivamente la lógica de tokens JWT y refresh tokens
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Genera un refresh token aleatorio seguro
   */
  generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  /**
   * Genera un access token JWT
   */
  generateAccessToken(payload: CurrentUserPayload): string {
    return this.jwtService.sign(payload, { expiresIn: AUTH.ACCESS_TOKEN_EXPIRY });
  }

  /**
   * Almacena un refresh token en la base de datos
   */
  async storeRefreshToken(
    token: string,
    usuarioId: string,
    expiresInDays: number = AUTH.REFRESH_TOKEN_EXPIRY_DAYS,
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

  /**
   * Revoca un refresh token específico
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Revoca todos los tokens de un usuario
   */
  async revokeAllUserTokens(usuarioId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuario_id: usuarioId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Valida si un refresh token es válido
   */
  async validateRefreshToken(token: string): Promise<boolean> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!storedToken) return false;
    if (storedToken.revoked_at) return false;
    if (new Date() > storedToken.expires_at) return false;

    return true;
  }

  /**
   * Rota refresh tokens: revoca el actual y crea uno nuevo
   */
  async rotateRefreshToken(
    currentToken: string,
    usuarioId: string,
  ): Promise<{ newToken: string; expiresAt: Date }> {
    const newToken = this.generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + AUTH.REFRESH_TOKEN_EXPIRY_DAYS);

    // Usar transacción atómica
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { token: currentToken },
        data: { revoked_at: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          token: newToken,
          usuario_id: usuarioId,
          expires_at: expiresAt,
        },
      }),
    ]);

    return { newToken, expiresAt };
  }
}
