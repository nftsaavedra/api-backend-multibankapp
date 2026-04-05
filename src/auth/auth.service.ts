import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { CurrentUserPayload } from '../core/current-user.decorator';

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

    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      access_token,
      refresh_token,
      user: payload,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = this.jwtService.verify<CurrentUserPayload>(refreshToken);
      
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: payload.userId },
      });

      if (!usuario || !usuario.activo) {
        throw new UnauthorizedException('Usuario no válido');
      }

      const newPayload: CurrentUserPayload = {
        userId: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
      };

      const access_token = this.jwtService.sign(newPayload);
      const refresh_token = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

      return {
        access_token,
        refresh_token,
        user: newPayload,
      };
    } catch {
      throw new UnauthorizedException('Token de refresco inválido');
    }
  }
}
