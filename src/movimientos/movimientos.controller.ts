import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { MovimientosService } from './movimientos.service';
import { CreateMovimientoDto, FindMovimientosFiltersDto } from './dto';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';
import { Roles } from '../core/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../core/current-user.decorator';
import { RolUsuario, EstadoConciliacion, EstadoMovimiento } from '@prisma/client';

@Controller('movimientos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MovimientosController {
  constructor(private readonly service: MovimientosService) {}

  @Post()
  async create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateMovimientoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user.userId, user.rol);
  }

  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('estadoConciliacion') estadoConciliacion?: EstadoConciliacion,
    @Query('estadoAprobacion') estadoAprobacion?: EstadoMovimiento,
  ) {
    return this.service.findAll({
      operadorId: user.rol === RolUsuario.OPERADOR ? user.userId : undefined,
      estadoConciliacion,
      estadoAprobacion,
    });
  }

  @Patch(':id/aprobar')
  @Roles(RolUsuario.SUPERVISOR)
  async aprobar(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.aprobar(id, user.userId);
  }

  @Patch(':id/rechazar')
  @Roles(RolUsuario.SUPERVISOR)
  async rechazar(@Param('id') id: string) {
    return this.service.rechazar(id);
  }
}
