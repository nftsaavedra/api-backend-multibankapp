import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { EntidadesFinancierasService } from './entidades-financieras.service';
import { CreateEntidadDto, UpdateEntidadDto } from './dto';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';
import { Roles } from '../core/roles.decorator';
import { RolUsuario } from '@prisma/client';

@Controller('entidades-financieras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntidadesFinancierasController {
  constructor(private readonly service: EntidadesFinancierasService) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(RolUsuario.SUPERVISOR)
  async create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateEntidadDto,
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(RolUsuario.SUPERVISOR)
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateEntidadDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/saldo')
  @Roles(RolUsuario.SUPERVISOR)
  async updateSaldo(
    @Param('id') id: string,
    @Body('nuevoSaldo') nuevoSaldo: string,
  ) {
    return this.service.updateSaldo(id, parseFloat(nuevoSaldo));
  }

  @Delete(':id')
  @Roles(RolUsuario.SUPERVISOR)
  async delete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
