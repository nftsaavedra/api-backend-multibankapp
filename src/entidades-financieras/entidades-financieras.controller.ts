import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EntidadesFinancierasService, type CreateEntidadDto, type UpdateEntidadDto } from './entidades-financieras.service';
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
  async create(@Body() dto: CreateEntidadDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(RolUsuario.SUPERVISOR)
  async update(@Param('id') id: string, @Body() dto: UpdateEntidadDto) {
    return this.service.update(id, dto);
  }
}
