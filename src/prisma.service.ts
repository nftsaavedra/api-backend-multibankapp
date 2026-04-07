import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    // 1. Inicializar el pool nativo de PostgreSQL
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });

    // 2. Acoplar el adaptador de Prisma
    const adapter = new PrismaPg(pool);

    // 3. Inyectar el adaptador al inicializar la clase padre
    super({ adapter });

    // 4. Guardar referencia para cleanup
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // Cerrar el pool de conexiones
    await this.pool.end();
  }
}
