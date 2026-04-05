import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EntidadFinanciera } from '@prisma/client';

export interface CreateEntidadDto {
  tipo: string;
  nombre: string;
  saldoInicial: number;
}

export interface UpdateEntidadDto {
  tipo?: string;
  nombre?: string;
  activo?: boolean;
}

@Injectable()
export class EntidadesFinancierasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<EntidadFinanciera[]> {
    return this.prisma.entidadFinanciera.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async findById(id: string): Promise<EntidadFinanciera> {
    const entidad = await this.prisma.entidadFinanciera.findUnique({
      where: { id },
    });
    if (!entidad) {
      throw new NotFoundException('Entidad financiera no encontrada');
    }
    return entidad;
  }

  async findByNombre(nombre: string): Promise<EntidadFinanciera | null> {
    return this.prisma.entidadFinanciera.findUnique({
      where: { nombre },
    });
  }

  async create(dto: CreateEntidadDto): Promise<EntidadFinanciera> {
    return this.prisma.entidadFinanciera.create({
      data: {
        tipo: dto.tipo,
        nombre: dto.nombre,
        saldo_actual: dto.saldoInicial,
        activo: true,
      },
    });
  }

  async update(id: string, dto: UpdateEntidadDto): Promise<EntidadFinanciera> {
    await this.findById(id);
    return this.prisma.entidadFinanciera.update({
      where: { id },
      data: dto,
    });
  }

  async updateSaldo(id: string, nuevoSaldo: number): Promise<void> {
    await this.findById(id);
    await this.prisma.entidadFinanciera.update({
      where: { id },
      data: { saldo_actual: nuevoSaldo },
    });
  }
}
