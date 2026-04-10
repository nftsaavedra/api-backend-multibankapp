import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CortesCajaService } from './cortes-caja.service';
import { CreateCorteDto } from './dto';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../core/current-user.decorator';
import { RolUsuario, TipoCorte } from '@prisma/client';

@Controller('cortes-caja')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CortesCajaController {
  constructor(private readonly service: CortesCajaService) {}

  @Post()
  async create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateCorteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.service.findAll({
      operadorId: user.rol === RolUsuario.ADMIN ? undefined : user.userId,
      fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
      fechaHasta: fechaHasta ? new Date(fechaHasta) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get('tipo/:tipoCorte')
  async findByType(
    @Param('tipoCorte') tipoCorte: TipoCorte,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findByType(
      tipoCorte,
      user.rol === RolUsuario.ADMIN ? undefined : user.userId,
    );
  }

  @Get('latest')
  async getLatest(
    @CurrentUser() user: CurrentUserPayload,
    @Query('fecha') fecha?: string,
  ) {
    const searchDate = fecha ? new Date(fecha) : new Date();
    return this.service.getLatestByOperatorAndDate(user.userId, searchDate);
  }

  @Get('latest/ultimo')
  async getUltimoCorte(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findUltimoCorte(user.userId);
  }

  @Get('ultimo-para-comparacion')
  @UseGuards(JwtAuthGuard)
  async getUltimoCorteParaComparacion(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getUltimoCorteParaComparacion(user.userId);
  }

  @Get('kasnet-acumulado')
  async getKasnetAcumulado(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getKasnetAcumuladoMes(user.userId);
  }
}
