import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as argon2 from 'argon2';
import { RolUsuario } from '@prisma/client';

export interface SetupStatus {
  initialized: boolean;
  hasAdmin: boolean;
  entitiesCount: number;
}

export interface InitSetupDto {
  username: string;
  password: string;
}

export interface SetupResult {
  success: boolean;
  message: string;
  createdEntities: string[];
}

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<SetupStatus> {
    const admin = await this.prisma.usuario.findFirst({
      where: { rol: RolUsuario.ADMIN },
    });

    const entitiesCount = await this.prisma.entidadFinanciera.count({
      where: { activo: true },
    });

    return {
      initialized: !!admin,
      hasAdmin: !!admin,
      entitiesCount,
    };
  }

  async initialize(dto: InitSetupDto): Promise<SetupResult> {
    const status = await this.getStatus();

    if (status.initialized) {
      throw new ForbiddenException('El sistema ya ha sido inicializado');
    }

    return this.prisma.$transaction(async (tx) => {
      const passwordHash = await argon2.hash(dto.password);

      await tx.usuario.create({
        data: {
          username: dto.username,
          password_hash: passwordHash,
          rol: RolUsuario.ADMIN,
          activo: true,
        },
      });

      const entidadesBase = [
        {
          tipo: 'EFECTIVO',
          nombre: 'Caja Principal',
          saldo_actual: 0,
          activo: true,
        },
        {
          tipo: 'DIGITAL',
          nombre: 'BIM',
          saldo_actual: 0,
          activo: true,
        },
        {
          tipo: 'DIGITAL',
          nombre: 'Kasnet POS',
          saldo_actual: 0,
          activo: true,
        },
        {
          tipo: 'DIGITAL',
          nombre: 'Caja Piura',
          saldo_actual: 0,
          activo: true,
        },
      ];

      const createdEntities: string[] = [];

      for (const entidad of entidadesBase) {
        const created = await tx.entidadFinanciera.create({
          data: entidad,
        });
        createdEntities.push(created.nombre);
      }

      return {
        success: true,
        message: 'Sistema inicializado correctamente',
        createdEntities,
      };
    });
  }
}
