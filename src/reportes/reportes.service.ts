import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TipoCorte } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async generarReporteSemanal(operadorId: string) {
    const ahora = DateTime.now().setZone('America/Lima');
    const inicioSemana = ahora.startOf('week');
    const finSemana = ahora.endOf('week');

    // 1. Cortes CIERRE_DIA de la semana
    const cortes = await this.prisma.corteCaja.findMany({
      where: {
        operador_id: operadorId,
        fecha_corte_ejecucion: {
          gte: inicioSemana.toJSDate(),
          lte: finSemana.toJSDate(),
        },
        tipo_corte: TipoCorte.CIERRE_DIA,
        es_correccion: false, // Excluir correcciones del resumen
      },
      orderBy: { fecha_corte_ejecucion: 'asc' },
    });

    // 2. Totales
    const totalComisiones = cortes.reduce(
      (sum, c) => sum + Number(c.excedente_comision), 0
    );
    const totalOperaciones = cortes.reduce(
      (sum, c) => sum + c.operaciones_kasnet, 0
    );

    // 3. Métricas
    const diasTrabajados = cortes.length;
    const promedioOperaciones = diasTrabajados > 0 
      ? totalOperaciones / diasTrabajados 
      : 0;
    const diasSinMinimo = cortes.filter(c => !c.cumple_minimo_operativo).length;
    const cumplimientoMinimo = diasTrabajados > 0
      ? ((diasTrabajados - diasSinMinimo) / diasTrabajados) * 100
      : 0;

    // 4. Estado actual de cuentas
    const cuentas = await this.prisma.entidadFinanciera.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        saldo_actual: true,
      },
    });

    return {
      periodo: {
        inicio: inicioSemana.toISO(),
        fin: finSemana.toISO(),
      },
      resumen: {
        totalComisiones,
        totalOperaciones,
        promedioOperacionesDiarias: Math.round(promedioOperaciones),
        diasTrabajados,
        diasSinMinimo,
        cumplimientoMinimo: Math.round(cumplimientoMinimo),
      },
      cuentas: cuentas.map(c => ({
        nombre: c.nombre,
        tipo: c.tipo,
        saldoActual: Number(c.saldo_actual),
      })),
      cortesDiarios: cortes.map(c => ({
        fecha: c.fecha_corte_ejecucion,
        efectivo: Number(c.saldo_efectivo_declarado),
        digital: Number(c.saldo_digital_declarado),
        comisiones: Number(c.excedente_comision),
        operaciones: c.operaciones_kasnet,
        cumpleMinimo: c.cumple_minimo_operativo,
      })),
    };
  }

  async generarReporteHistorico(operadorId: string, semanas: number = 4) {
    const ahora = DateTime.now().setZone('America/Lima');
    const inicioPeriodo = ahora.minus({ weeks: semanas }).startOf('week');

    const cortes = await this.prisma.corteCaja.findMany({
      where: {
        operador_id: operadorId,
        fecha_corte_ejecucion: {
          gte: inicioPeriodo.toJSDate(),
        },
        tipo_corte: TipoCorte.CIERRE_DIA,
        es_correccion: false,
      },
      orderBy: { fecha_corte_ejecucion: 'asc' },
    });

    // Agrupar por semana
    const semanasMap: Record<string, any> = {};
    
    cortes.forEach(corte => {
      const fecha = DateTime.fromJSDate(corte.fecha_corte_ejecucion);
      const semanaKey = fecha.startOf('week').toISODate() as string;
      
      if (!semanasMap[semanaKey]) {
        semanasMap[semanaKey] = {
          semana: semanaKey,
          totalComisiones: 0,
          totalOperaciones: 0,
          diasTrabajados: 0,
        };
      }
      
      semanasMap[semanaKey].totalComisiones += Number(corte.excedente_comision);
      semanasMap[semanaKey].totalOperaciones += corte.operaciones_kasnet;
      semanasMap[semanaKey].diasTrabajados += 1;
    });

    return {
      periodo: {
        inicio: inicioPeriodo.toISO(),
        fin: ahora.toISO(),
        semanas: semanas,
      },
      tendenciaSemanal: Object.values(semanasMap).sort(
        (a, b) => a.semana.localeCompare(b.semana)
      ),
    };
  }
}
