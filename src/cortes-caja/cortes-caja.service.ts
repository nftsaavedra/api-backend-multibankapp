import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CorteCaja, EstadoConciliacion, EstadoMovimiento, TipoCorte } from '@prisma/client';
import { DateTime } from 'luxon';
import type { CreateCorteDto, FindCortesFiltersDto } from './dto';
import { BalanceAdjusterService } from './balance-adjuster.service';

const TIMEZONE = 'America/Lima';

// Orden secuencial de cortes
const ORDEN_CORTES: TipoCorte[] = [
  TipoCorte.INICIO_DIA,
  TipoCorte.MEDIO_DIA,
  TipoCorte.INICIO_TARDE,
  TipoCorte.CIERRE_DIA,
];

export interface CorteResult {
  corte: CorteCaja;
  movimientosSellados: number;
  advertencia?: string;
}

@Injectable()
export class CortesCajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceAdjuster: BalanceAdjusterService,
  ) {}

  async findAll(filters?: FindCortesFiltersDto): Promise<CorteCaja[]> {
    const where: Record<string, unknown> = {};

    if (filters?.operadorId) {
      where.operador_id = filters.operadorId;
    }
    if (filters?.fechaDesde || filters?.fechaHasta) {
      where.fecha_corte_ejecucion = {};
      if (filters.fechaDesde) {
        (where.fecha_corte_ejecucion as Record<string, Date>).gte =
          filters.fechaDesde;
      }
      if (filters.fechaHasta) {
        (where.fecha_corte_ejecucion as Record<string, Date>).lte =
          filters.fechaHasta;
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
   * Valida la secuencialidad de cortes de caja
   * Considera el último corte registrado en el sistema (no solo del día actual)
   * Si hay días sin actividad, compara con el último corte registrado
   */
  async validarSecuenciaCortes(
    operadorId: string,
    tipoCorteSolicitado: TipoCorte,
    esCorreccion = false,
  ): Promise<{ permitido: boolean; siguienteTipo?: TipoCorte; advertencia?: string }> {
    const ahora = DateTime.now().setZone(TIMEZONE);
    const inicioDia = ahora.startOf('day');

    // Si es corrección, permitir pero con advertencia
    if (esCorreccion) {
      return {
        permitido: true,
        advertencia: 'Este es un corte de corrección. Se mantendrá el historial de cambios.',
      };
    }

    // Obtener TODOS los cortes del operador (sin límite de fecha)
    const todosCortes = await this.prisma.corteCaja.findMany({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });

    // Filtrar solo cortes no corregidos
    const cortesValidos = todosCortes.filter(c => !c.es_correccion);

    // Si no hay cortes en absoluto, solo se permite INICIO_DIA
    if (cortesValidos.length === 0) {
      if (tipoCorteSolicitado !== TipoCorte.INICIO_DIA) {
        throw new ConflictException(
          `No se puede registrar ${this.getNombreCorte(tipoCorteSolicitado)} como primer corte del sistema. Debe iniciar con "Inicio de Día".`,
        );
      }
      return { permitido: true, siguienteTipo: TipoCorte.MEDIO_DIA };
    }

    const ultimoCorte = cortesValidos[0]; // Ya está ordenado por fecha desc
    const fechaUltimoCorte = DateTime.fromJSDate(ultimoCorte.fecha_corte_ejecucion).setZone(TIMEZONE);

    // Verificar si el último corte fue hoy
    const ultimoCorteEsHoy = fechaUltimoCorte.hasSame(inicioDia, 'day');

    // Detectar si hay días sin cerrar
    const hayDiasSinCerrar = !ultimoCorteEsHoy && ultimoCorte.tipo_corte !== TipoCorte.CIERRE_DIA;

    // Si el último corte fue en un día anterior y NO fue CIERRE_DIA
    if (!ultimoCorteEsHoy && ultimoCorte.tipo_corte !== TipoCorte.CIERRE_DIA) {
      // Se asume que el día anterior se cerró automáticamente
      // El nuevo día debe iniciar con INICIO_DIA
      if (tipoCorteSolicitado !== TipoCorte.INICIO_DIA) {
        throw new ConflictException(
          `El último corte registrado fue "${this.getNombreCorte(ultimoCorte.tipo_corte)}" el ${fechaUltimoCorte.toFormat('dd/MM/yyyy')}. ` +
          `No se registró cierre de ese día. Se asume cierre automático. Debe iniciar el nuevo día con "Inicio de Día".`,
        );
      }

      return {
        permitido: true,
        siguienteTipo: TipoCorte.MEDIO_DIA,
        advertencia: `El último corte fue "${this.getNombreCorte(ultimoCorte.tipo_corte)}" el ${fechaUltimoCorte.toFormat('dd/MM/yyyy')} sin cierre. Se asume cierre automático del día anterior.`,
      };
    }

    // Si el último corte fue CIERRE_DIA (ayer o antes), iniciar nuevo día
    if (!ultimoCorteEsHoy && ultimoCorte.tipo_corte === TipoCorte.CIERRE_DIA) {
      if (tipoCorteSolicitado !== TipoCorte.INICIO_DIA) {
        throw new ConflictException(
          `El último corte fue "Cierre de Día" el ${fechaUltimoCorte.toFormat('dd/MM/yyyy')}. ` +
          `Debe iniciar el nuevo día con "Inicio de Día".`,
        );
      }

      return {
        permitido: true,
        siguienteTipo: TipoCorte.MEDIO_DIA,
        advertencia: `Nuevo día iniciado. Último cierre: ${fechaUltimoCorte.toFormat('dd/MM/yyyy HH:mm')}.`,
      };
    }

    // === LÓGICA PARA CORTES DEL MISMO DÍA ===

    // Obtener cortes del día actual
    const cortesHoy = todosCortes.filter(c =>
      DateTime.fromJSDate(c.fecha_corte_ejecucion).setZone(TIMEZONE).hasSame(inicioDia, 'day') &&
      !c.es_correccion
    );

    // Verificar si ya existe un corte del mismo tipo hoy
    const corteMismoTipo = cortesHoy.find(
      c => c.tipo_corte === tipoCorteSolicitado,
    );

    if (corteMismoTipo && tipoCorteSolicitado === TipoCorte.INICIO_DIA) {
      throw new ConflictException(
        'Ya existe un corte de "Inicio de Día" registrado hoy. Si necesita corregirlo, marque la opción "Es corrección".',
      );
    }

    // Validar orden secuencial para hoy
    if (cortesHoy.length > 0) {
      const ultimoCorteHoy = cortesHoy[cortesHoy.length - 1];
      const indiceUltimo = ORDEN_CORTES.indexOf(ultimoCorteHoy.tipo_corte);
      const indiceSolicitado = ORDEN_CORTES.indexOf(tipoCorteSolicitado);

      // Si el corte solicitado es anterior al último de hoy, es fuera de secuencia
      if (indiceSolicitado <= indiceUltimo) {
        throw new ConflictException(
          `Secuencia incorrecta. El último corte de hoy fue "${this.getNombreCorte(ultimoCorteHoy.tipo_corte)}". ` +
          `El siguiente corte permitido es "${this.getSiguienteCorte(ultimoCorteHoy.tipo_corte) || 'ninguno (día completado)'}". ` +
          `Si necesita corregir un corte anterior, marque la opción "Es corrección".`,
        );
      }

      // Si el corte solicitado no es el inmediato siguiente, advertir
      if (indiceSolicitado > indiceUltimo + 1) {
        const saltado = ORDEN_CORTES[indiceUltimo + 1];
        return {
          permitido: true,
          siguienteTipo: this.getSiguienteCorte(tipoCorteSolicitado),
          advertencia: `Está saltando el corte "${this.getNombreCorte(saltado)}". Asegúrese de que sea intencional.`,
        };
      }
    }

    return {
      permitido: true,
      siguienteTipo: this.getSiguienteCorte(tipoCorteSolicitado),
    };
  }

  /**
   * Obtiene el nombre legible del tipo de corte
   */
  private getNombreCorte(tipo: TipoCorte): string {
    const nombres: Record<TipoCorte, string> = {
      [TipoCorte.INICIO_DIA]: 'Inicio de Día',
      [TipoCorte.MEDIO_DIA]: 'Medio Día',
      [TipoCorte.INICIO_TARDE]: 'Inicio de Tarde',
      [TipoCorte.CIERRE_DIA]: 'Cierre de Día',
    };
    return nombres[tipo];
  }

  /**
   * Obtiene el siguiente tipo de corte en la secuencia
   */
  private getSiguienteCorte(tipoActual: TipoCorte): TipoCorte | undefined {
    const indice = ORDEN_CORTES.indexOf(tipoActual);
    if (indice < ORDEN_CORTES.length - 1) {
      return ORDEN_CORTES[indice + 1];
    }
    return undefined;
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
      let saldosEntidadesProcesadas: Array<{entidadId: string, declarado: number, sistema: number, diferencia: number}> = [];
      let totalEfectivoDeclarado = 0;
      let totalDigitalDeclarado = 0;
      let totalEfectivoSistema = 0;
      let totalDigitalSistema = 0;

      if (dto.saldosEntidades && dto.saldosEntidades.length > 0) {
        // NUEVO FLUJO: Usar saldos por entidad
        for (const saldoEntidad of dto.saldosEntidades) {
          const cuenta = todasCuentas.find(c => c.id === saldoEntidad.entidadId);
          if (!cuenta) continue;

          const saldoSistema = Number(cuenta.saldo_actual);
          const diferencia = saldoEntidad.saldoDeclarado - saldoSistema;

          saldosEntidadesProcesadas.push({
            entidadId: cuenta.id,
            declarado: saldoEntidad.saldoDeclarado,
            sistema: saldoSistema,
            diferencia,
          });

          // Clasificar para totales legacy
          const esEfectivo = cuenta.tipo.includes('EFECTIVO') || cuenta.tipo.includes('CAJA');
          if (esEfectivo) {
            totalEfectivoDeclarado += saldoEntidad.saldoDeclarado;
            totalEfectivoSistema += saldoSistema;
          } else {
            totalDigitalDeclarado += saldoEntidad.saldoDeclarado;
            totalDigitalSistema += saldoSistema;
          }
        }
      } else {
        // FLUJO LEGACY: Usar campos efectivo/digital directamente
        totalEfectivoDeclarado = dto.saldoEfectivoDeclarado || 0;
        totalDigitalDeclarado = dto.saldoDigitalDeclarado || 0;

        const cuentasEfectivo = todasCuentas.filter(c =>
          c.tipo.includes('EFECTIVO') || c.tipo.includes('CAJA'),
        );
        const cuentasDigital = todasCuentas.filter(c =>
          !c.tipo.includes('EFECTIVO') && !c.tipo.includes('CAJA'),
        );

        totalEfectivoSistema = cuentasEfectivo.reduce(
          (sum, c) => sum + Number(c.saldo_actual),
          0,
        );
        totalDigitalSistema = cuentasDigital.reduce(
          (sum, c) => sum + Number(c.saldo_actual),
          0,
        );
      }

      const diferenciaEfectivo = totalEfectivoDeclarado - totalEfectivoSistema;
      const diferenciaDigital = totalDigitalDeclarado - totalDigitalSistema;

      // 4. Validar mínimo operativo (solo para CIERRE_DIA)
      const operacionesKasnet = dto.operacionesKasnet || 0;
      const cumpleMinimo = dto.tipoCorte !== 'CIERRE_DIA' || operacionesKasnet >= 350;

      // 5. Generar observaciones
      const observaciones: string[] = [];
      if (dto.tipoCorte === 'CIERRE_DIA' && !cumpleMinimo) {
        observaciones.push(`⚠️ Solo ${operacionesKasnet}/350 operaciones diarias. Mínimo no cumplido.`);
      }
      if (Math.abs(diferenciaEfectivo) > 0.01) {
        observaciones.push(`📊 Ajuste efectivo: S/${diferenciaEfectivo.toFixed(2)}`);
      }
      if (Math.abs(diferenciaDigital) > 0.01) {
        observaciones.push(`📊 Ajuste digital: S/${diferenciaDigital.toFixed(2)}`);
      }

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

      // 9. AJUSTAR SALDOS si hay diferencias significativas
      if (Math.abs(diferenciaEfectivo) > 0.01 || Math.abs(diferenciaDigital) > 0.01) {
        // Ajustar cada entidad individualmente
        for (const saldoProc of saldosEntidadesProcesadas) {
          if (Math.abs(saldoProc.diferencia) > 0.01) {
            await tx.entidadFinanciera.update({
              where: { id: saldoProc.entidadId },
              data: { saldo_actual: { increment: saldoProc.diferencia } },
            });
          }
        }

        // Si no hay saldos detallados, usar método legacy proporcional
        if (saldosEntidadesProcesadas.length === 0) {
          const cuentasEfectivo = todasCuentas.filter(c =>
            c.tipo.includes('EFECTIVO') || c.tipo.includes('CAJA'),
          );
          const cuentasDigital = todasCuentas.filter(c =>
            !c.tipo.includes('EFECTIVO') && !c.tipo.includes('CAJA'),
          );

          if (Math.abs(diferenciaEfectivo) > 0.01) {
            await this.balanceAdjuster.adjustProportionally(
              tx,
              cuentasEfectivo,
              diferenciaEfectivo,
            );
          }
          if (Math.abs(diferenciaDigital) > 0.01) {
            await this.balanceAdjuster.adjustProportionally(
              tx,
              cuentasDigital,
              diferenciaDigital,
            );
          }
        }
      }

      // 10. REGISTRAR MOVIMIENTO DE COMISIÓN si hay excedente declarado
      if (dto.excedenteComision > 0) {
        const cuentaEfectivoPrincipal = todasCuentas.find(c =>
          c.tipo.includes('EFECTIVO') || c.tipo.includes('CAJA'),
        );

        if (cuentaEfectivoPrincipal) {
          await tx.movimientoAdministrativo.create({
            data: {
              operador_id: operadorId,
              concepto: `Comisión ${this.getNombreCorte(dto.tipoCorte)} - ${DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd')}`,
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
    const meta = 350; // Meta diaria
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
