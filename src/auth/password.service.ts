import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { RolUsuario } from '@prisma/client';
import { AUTH } from '../core/constants';

/**
 * Servicio de Gestión de Contraseñas
 * SRP: Maneja exclusivamente la validación y hashing de contraseñas
 */
@Injectable()
export class PasswordService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera el hash de una contraseña usando argon2id
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verifica si una contraseña coincide con su hash
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Valida que una contraseña cumpla con los requisitos mínimos
   */
  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < AUTH.MIN_PASSWORD_LENGTH) {
      errors.push(`La contraseña debe tener al menos ${AUTH.MIN_PASSWORD_LENGTH} caracteres`);
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una mayúscula');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una minúscula');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('La contraseña debe contener al menos un número');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Valida las credenciales de un usuario
   */
  async validateCredentials(username: string, password: string): Promise<{ valid: boolean; user?: { id: string; username: string; rol: RolUsuario; activo: boolean } }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { username },
    });

    if (!usuario || !usuario.activo) {
      return { valid: false };
    }

    const isPasswordValid = await this.verifyPassword(usuario.password_hash, password);

    if (!isPasswordValid) {
      return { valid: false };
    }

    return {
      valid: true,
      user: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        activo: usuario.activo,
      },
    };
  }

  /**
   * Valida que la contraseña actual sea correcta
   */
  async validateCurrentPassword(usuarioId: string, currentPassword: string): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return this.verifyPassword(usuario.password_hash, currentPassword);
  }

  /**
   * Actualiza la contraseña de un usuario
   */
  async updatePassword(usuarioId: string, newPassword: string): Promise<void> {
    const validation = this.validatePasswordStrength(newPassword);
    
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('. '));
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { password_hash: passwordHash },
    });
  }
}
