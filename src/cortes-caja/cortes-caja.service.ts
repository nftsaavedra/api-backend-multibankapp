import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CorteCaja, EstadoConciliacion, TipoCorte } from '@prisma/client';
import { DateTime } from 'luxon';
import type { CreateCorteDto, FindCortesFiltersDto } from './dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
   * Retorna el siguiente tipo de corte permitido
   */
  async validarSecuenciaCortes(
    operadorId: string,
    tipoCorteSolicitado: TipoCorte,
    esCorreccion = false,
  ): Promise<{ permitido: boolean; siguienteTipo?: TipoCorte; advertencia?: string }> {
    const ahora = DateTime.now().setZone(TIMEZONE);
    const inicioDia = ahora.startOf('day');

    // Obtener todos los cortes del día actual
    const cortesHoy = await this.prisma.corteCaja.findMany({
      where: {
        operador_id: operadorId,
        fecha_corte_ejecucion: {
          gte: inicioDia.toJSDate(),
        },
      },
      orderBy: { fecha_corte_ejecucion: 'asc' },
    });

    // Si es corrección, permitir pero con advertencia
    if (esCorreccion) {
      return {
        permitido: true,
        advertencia: 'Este es un corte de corrección. Se mantendrá el historial de cambios.',
      };
    }

    // Si no hay cortes hoy, solo se permite INICIO_DIA
    if (cortesHoy.length === 0) {
      if (tipoCorteSolicitado !== TipoCorte.INICIO_DIA) {
        throw new ConflictException(
          `No se puede registrar ${this.getNombreCorte(tipoCorteSolicitado)} como primer corte del día. Debe iniciar con "Inicio de Día".`,
        );
      }
      return { permitido: true, siguienteTipo: TipoCorte.MEDIO_DIA };
    }

    // Filtrar solo cortes no corregidos (los que no tienen corte_anulado_id)
    const cortesValidos = cortesHoy.filter(c => !c.es_correccion);
    const ultimoCorte = cortesValidos[cortesValidos.length - 1];

    // Verificar si ya existe un corte del mismo tipo
    const corteMismoTipo = cortesValidos.find(
      c => c.tipo_corte === tipoCorteSolicitado,
    );

    if (corteMismoTipo && tipoCorteSolicitado === TipoCorte.INICIO_DIA) {
      throw new ConflictException(
        'Ya existe un corte de "Inicio de Día" registrado hoy. Si necesita corregirlo, marque la opción "Es corrección".',
      );
    }

    // Validar orden secuencial
    const indiceUltimo = ORDEN_CORTES.indexOf(ultimoCorte.tipo_corte);
    const indiceSolicitado = ORDEN_CORTES.indexOf(tipoCorteSolicitado);

    // Si el corte solicitado es anterior al último, es fuera de secuencia
    if (indiceSolicitado <= indiceUltimo) {
      throw new ConflictException(
        `Secuencia incorrecta. El último corte fue "${this.getNombreCorte(ultimoCorte.tipo_corte)}". ` +
        `El siguiente corte permitido es "${this.getSiguienteCorte(ultimoCorte.tipo_corte) || 'ninguno (día completado)'}". ` +
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

    // Validar secuencialidad de cortes
    const validacion = await this.validarSecuenciaCortes(
      operadorId,
      dto.tipoCorte,
      dto.esCorreccion || false,
    );

    return this.prisma.$transaction(async (tx) => {
      // Si es corrección, buscar el corte a corregir
      let corteAnuladoId: string | null = null;
      if (dto.esCorreccion && dto.motivoCorreccion) {
        // Buscar el último corte del mismo tipo para anularlo
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

      const corte = await tx.corteCaja.create({
        data: {
          operador_id: operadorId,
          tipo_corte: dto.tipoCorte,
          fecha_inicio_bloque: fechaInicioBloque,
          saldo_efectivo_declarado: dto.saldoEfectivoDeclarado,
          saldo_digital_declarado: dto.saldoDigitalDeclarado,
          excedente_comision: dto.excedenteComision,
          operaciones_kasnet: dto.operacionesKasnet,
          es_correccion: dto.esCorreccion || false,
          motivo_correccion: dto.motivoCorreccion || null,
          corte_anulado_id: corteAnuladoId,
        },
      });

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
}
