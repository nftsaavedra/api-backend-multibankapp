import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Usuario, Prisma, RolUsuario } from '@prisma/client';
import { CreateUsuarioDto, UpdateUsuarioDto, ChangePasswordDto } from './dto';
import { PasswordService } from '../auth/password.service';

/**
 * Servicio de Usuarios - Refactorizado
 * SRP: Usa PasswordService para gestión de contraseñas
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Lista todos los usuarios (sin password_hash)
   */
  async findAll(): Promise<Omit<Usuario, 'password_hash'>[]> {
    return this.prisma.usuario.findMany({
      orderBy: { username: 'asc' },
      select: {
        id: true,
        username: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * Busca usuario por ID (sin password_hash)
   */
  async findById(id: string): Promise<Omit<Usuario, 'password_hash'>> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        rol: true,
        activo: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  /**
   * Crea un nuevo usuario (ADMIN only)
   */
  async create(dto: CreateUsuarioDto): Promise<Omit<Usuario, 'password_hash'>> {
    // Verificar que el username no exista
    const existing = await this.prisma.usuario.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      throw new BadRequestException('El nombre de usuario ya existe');
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    return this.prisma.usuario.create({
      data: {
        username: dto.username,
        password_hash: passwordHash,
        rol: dto.rol,
        activo: dto.activo ?? true,
      },
      select: {
        id: true,
        username: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * Actualiza usuario (ADMIN only)
   */
  async update(
    id: string,
    dto: UpdateUsuarioDto,
  ): Promise<Omit<Usuario, 'password_hash'>> {
    await this.findById(id); // Validar que existe

    const updateData: Prisma.UsuarioUpdateInput = {};

    // Si se proporciona password, hashearlo
    if (dto.password) {
      updateData.password_hash = await this.passwordService.hashPassword(dto.password);
    }

    if (dto.username) {
      updateData.username = dto.username;
    }

    if (dto.rol) {
      updateData.rol = dto.rol;
    }

    if (dto.activo !== undefined) {
      updateData.activo = dto.activo;
    }

    return this.prisma.usuario.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * Soft delete de usuario (ADMIN only)
   */
  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { activo: false },
    });
  }

  /**
   * Cambia el rol de un usuario (ADMIN only)
   */
  async changeRole(
    id: string,
    nuevoRol: RolUsuario,
  ): Promise<Omit<Usuario, 'password_hash'>> {
    await this.findById(id);

    return this.prisma.usuario.update({
      where: { id },
      data: { rol: nuevoRol },
      select: {
        id: true,
        username: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * Cambia la contraseña del usuario autenticado
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    // Validar y actualizar usando PasswordService
    await this.passwordService.updatePassword(userId, dto.newPassword);
  }
}
