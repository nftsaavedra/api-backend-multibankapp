import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { CurrentUser } from '../core/current-user.decorator';
import type { CurrentUserPayload } from '../core/current-user.decorator';

@Controller('reportes')
@UseGuards(JwtAuthGuard)
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @Get('semanal')
  async reporteSemanal(@CurrentUser() user: CurrentUserPayload) {
    return this.service.generarReporteSemanal(user.userId);
  }

  @Get('semanal/historico')
  async reporteHistorico(
    @CurrentUser() user: CurrentUserPayload,
    @Query('semanas') semanas?: string,
  ) {
    const numSemanas = semanas ? parseInt(semanas) : 4;
    return this.service.generarReporteHistorico(user.userId, numSemanas);
  }
}
