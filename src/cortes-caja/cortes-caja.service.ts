import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CorteCaja, EstadoConciliacion, EstadoMovimiento, TipoCorte, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import type { CreateCorteDto, FindCortesFiltersDto } from './dto';
import { CorteSequenceValidatorService } from './corte-sequence-validator.service';
import { CorteBalanceProcessorService } from './corte-balance-processor.service';
import { TIMEZONE, CORTES, esTipoEfectivo } from '../core/constants';

export interface CorteResult {
  corte: CorteCaja;
  movimientosSellados: number;
  advertencia?: string;
}

/**
 * Servicio de Cortes de Caja - Orquestador
 * SRP: Coordina los servicios especializados para crear cortes de caja
 */
@Injectable()
export class CortesCajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceValidator: CorteSequenceValidatorService,
    private readonly balanceProcessor: CorteBalanceProcessorService,
  ) {}

  async findAll(filters?: FindCortesFiltersDto): Promise<CorteCaja[]> {
    const where: Prisma.CorteCajaWhereInput = {};

    if (filters?.operadorId) {
      where.operador_id = filters.operadorId;
    }
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha_corte_ejecucion = {};
      if (filters.fechaDesde) {
        where.fecha_corte_ejecucion.gte = filters.fechaDesde;
      }
      if (filters.fechaHasta) {
        where.fecha_corte_ejecucion.lte = filters.fechaHasta;
      }
    }

    return this.prisma.corteCaja.findMany({
      where,
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  async findById(id: string): Promise<CorteCaja> {
    const corte = await this.prisma.corteCaja.findUnique({
      where: { id },
    });
    if (!corte) {
      throw new NotFoundException('Corte de caja no encontrado');
    }
    return corte;
  }

  async findUltimoCortePorOperador(
    operadorId: string,
  ): Promise<CorteCaja | null> {
    return this.prisma.corteCaja.findFirst({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  /**
   * Valida la secuencialidad de cortes de caja (delegado a servicio especializado)
   */
  async validarSecuenciaCortes(
    operadorId: string,
    tipoCorteSolicitado: TipoCorte,
    esCorreccion = false,
  ) {
    return this.sequenceValidator.validarSecuencia(
      operadorId,
      tipoCorteSolicitado,
      esCorreccion,
    );
  }

  async create(dto: CreateCorteDto, operadorId: string): Promise<CorteResult> {
    const fechaInicioBloque =
      dto.fechaInicioBloque || DateTime.now().setZone(TIMEZONE).toJSDate();

    // 1. Validar secuencialidad de cortes
    const validacion = await this.validarSecuenciaCortes(
      operadorId,
      dto.tipoCorte,
      dto.esCorreccion || false,
    );

    return this.prisma.$transaction(async (tx) => {
      // 2. Obtener todas las cuentas activas (excluyendo comisiones)
      const todasCuentas = await tx.entidadFinanciera.findMany({
        where: { 
          activo: true,
          es_cuenta_comision: false,
        },
      });

      // 3. Procesar saldos declarados por entidad
      const resultado = this.balanceProcessor.procesarSaldosEntidades(todasCuentas, dto.saldosEntidades ?? []);
      const saldosEntidadesProcesadas = resultado.saldosProcesados;
      const totales = resultado.totales;

      const diferenciaEfectivo = totales.diferenciaEfectivo;
      const diferenciaDigital = totales.diferenciaDigital;
      const totalEfectivoDeclarado = totales.totalEfectivoDeclarado;
      const totalDigitalDeclarado = totales.totalDigitalDeclarado;
      const totalEfectivoSistema = totales.totalEfectivoSistema;
      const totalDigitalSistema = totales.totalDigitalSistema;

      // 4. Validar mínimo operativo (solo para CIERRE_DIA)
      const operacionesKasnet = dto.operacionesKasnet || 0;
      const cumpleMinimo = dto.tipoCorte !== 'CIERRE_DIA' || operacionesKasnet >= CORTES.MINIMO_KASNET;

      // 5. Generar observaciones (delegado a servicio especializado)
      const observaciones = this.balanceProcessor.generarObservaciones(
        dto.tipoCorte,
        operacionesKasnet,
        totales,
      );

      // 6. Si es corrección, buscar el corte a corregir
      let corteAnuladoId: string | null = null;
      if (dto.esCorreccion && dto.motivoCorreccion) {
        const ultimoCorteMismoTipo = await tx.corteCaja.findFirst({
          where: {
            operador_id: operadorId,
            tipo_corte: dto.tipoCorte,
            es_correccion: false,
          },
          orderBy: { fecha_corte_ejecucion: 'desc' },
        });

        if (ultimoCorteMismoTipo) {
          corteAnuladoId = ultimoCorteMismoTipo.id;
        }
      }

      // 7. Crear corte con métricas
      const corte = await tx.corteCaja.create({
        data: {
          operador_id: operadorId,
          tipo_corte: dto.tipoCorte,
          fecha_inicio_bloque: fechaInicioBloque,
          saldo_efectivo_declarado: totalEfectivoDeclarado,
          saldo_digital_declarado: totalDigitalDeclarado,
          excedente_comision: dto.excedenteComision,
          operaciones_kasnet: operacionesKasnet,
          saldo_efectivo_sistema: totalEfectivoSistema,
          saldo_digital_sistema: totalDigitalSistema,
          diferencia_efectivo: diferenciaEfectivo,
          diferencia_digital: diferenciaDigital,
          cumple_minimo_operativo: cumpleMinimo,
          observaciones: observaciones.length > 0 ? observaciones.join(' | ') : null,
          es_correccion: dto.esCorreccion || false,
          motivo_correccion: dto.motivoCorreccion || null,
          corte_anulado_id: corteAnuladoId,
        },
      });

      // 8. Guardar saldos detallados por entidad
      if (saldosEntidadesProcesadas.length > 0) {
        await Promise.all(
          saldosEntidadesProcesadas.map((s) =>
            tx.corteEntidadSaldo.create({
              data: {
                corte_id: corte.id,
                entidad_id: s.entidadId,
                saldo_declarado: s.declarado,
                saldo_sistema: s.sistema,
                diferencia: s.diferencia,
              },
            })
          )
        );
      }

      // 9. AJUSTAR SALDOS si hay diferencias significativas (delegado a servicio)
      if (Math.abs(diferenciaEfectivo) > CORTES.UMBRAL_DIFERENCIA || Math.abs(diferenciaDigital) > CORTES.UMBRAL_DIFERENCIA) {
        await this.balanceProcessor.ajustarDiferencias(
          tx,
          saldosEntidadesProcesadas,
          totales,
          todasCuentas,
          CORTES.UMBRAL_DIFERENCIA,
        );
      }

      // 10. REGISTRAR MOVIMIENTO DE COMISIÓN si hay excedente declarado
      if (dto.excedenteComision > 0) {
        const cuentaEfectivoPrincipal = todasCuentas.find((c) => esTipoEfectivo(c.tipo));

        if (cuentaEfectivoPrincipal) {
          await tx.movimientoAdministrativo.create({
            data: {
              operador_id: operadorId,
              concepto: `Comisión ${this.sequenceValidator.getNombreCorte(dto.tipoCorte)} - ${DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd')}`,
              monto: dto.excedenteComision,
              estado_aprobacion: EstadoMovimiento.APROBADO,
              estado_conciliacion: EstadoConciliacion.CONCILIADO,
              cuenta_origen_id: null,
              cuenta_destino_id: cuentaEfectivoPrincipal.id,
              corte_id: corte.id,
            },
          });
        }
      }

      // 11. Sellar movimientos pendientes
      const updateResult = await tx.movimientoAdministrativo.updateMany({
        where: {
          operador_id: operadorId,
          estado_conciliacion: EstadoConciliacion.NO_CONCILIADO,
        },
        data: {
          corte_id: corte.id,
          estado_conciliacion: EstadoConciliacion.CONCILIADO,
        },
      });

      return {
        corte,
        movimientosSellados: updateResult.count,
        advertencia: validacion.advertencia,
      };
    });
  }

  /**
   * Obtiene cortes por tipo de corte
   */
  async findByType(
    tipoCorte: TipoCorte,
    operadorId?: string,
  ): Promise<CorteCaja[]> {
    return this.prisma.corteCaja.findMany({
      where: {
        tipo_corte: tipoCorte,
        ...(operadorId && { operador_id: operadorId }),
      },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  /**
   * Obtiene el último corte de un operador en una fecha específica
   */
  async getLatestByOperatorAndDate(
    operadorId: string,
    fecha: Date,
  ): Promise<CorteCaja | null> {
    const startOfDay = new Date(fecha);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(fecha);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.corteCaja.findFirst({
      where: {
        operador_id: operadorId,
        fecha_corte_ejecucion: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  /**
   * Obtiene el último corte ejecutado por un operador (sin importar fecha)
   */
  async findUltimoCorte(operadorId: string): Promise<CorteCaja | null> {
    return this.prisma.corteCaja.findFirst({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });
  }

  /**
   * Obtiene el último corte para comparación de saldos
   * Retorna el último corte registrado con sus saldos detallados por entidad
   */
  async getUltimoCorteParaComparacion(operadorId: string): Promise<CorteCaja | null> {
    const ultimoCorte = await this.prisma.corteCaja.findFirst({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
      include: {
        saldos_detalle: true,
      },
    });

    return ultimoCorte;
  }

  /**
   * Obtiene el total acumulado de operaciones KasNet del mes actual
   */
  async getKasnetAcumuladoMes(operadorId: string): Promise<{ total: number; meta: number; porcentaje: number }> {
    const ahora = DateTime.now().setZone(TIMEZONE);
    const inicioMes = ahora.startOf('month').toJSDate();
    const finMes = ahora.endOf('month').toJSDate();

    const cortes = await this.prisma.corteCaja.findMany({
      where: {
        operador_id: operadorId,
        fecha_corte_ejecucion: {
          gte: inicioMes,
          lte: finMes,
        },
        tipo_corte: TipoCorte.CIERRE_DIA, // Solo contar cierres de día
      },
      select: {
        operaciones_kasnet: true,
      },
    });

    const total = cortes.reduce((sum, c) => sum + c.operaciones_kasnet, 0);
    const meta = CORTES.MINIMO_KASNET;
    const diasTranscurridos = ahora.day;
    const metaMensual = meta * diasTranscurridos;
    const porcentaje = metaMensual > 0 ? (total / metaMensual) * 100 : 0;

    return {
      total,
      meta: metaMensual,
      porcentaje: Math.round(porcentaje * 100) / 100,
    };
  }
}
