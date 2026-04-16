import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TipoCorte, CorteCaja } from '@prisma/client';
import { DateTime } from 'luxon';

const TIMEZONE = 'America/Lima';

// Orden secuencial de cortes
const ORDEN_CORTES: TipoCorte[] = [
  TipoCorte.INICIO_DIA,
  TipoCorte.MEDIO_DIA,
  TipoCorte.INICIO_TARDE,
  TipoCorte.CIERRE_DIA,
];

export interface ValidacionSecuenciaResult {
  permitido: boolean;
  siguienteTipo?: TipoCorte;
  advertencia?: string;
}

/**
 * Servicio especializado en validación de secuencialidad de cortes de caja
 * SRP: Solo maneja lógica de secuencia y orden de cortes
 */
@Injectable()
export class CorteSequenceValidatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida la secuencialidad de cortes de caja
   * Considera el último corte registrado en el sistema (no solo del día actual)
   */
  async validarSecuencia(
    operadorId: string,
    tipoCorteSolicitado: TipoCorte,
    esCorreccion = false,
  ): Promise<ValidacionSecuenciaResult> {
    const ahora = DateTime.now().setZone(TIMEZONE);
    const inicioDia = ahora.startOf('day');

    // Si es corrección, permitir pero con advertencia
    if (esCorreccion) {
      return {
        permitido: true,
        advertencia:
          'Este es un corte de corrección. Se mantendrá el historial de cambios.',
      };
    }

    // Obtener TODOS los cortes del operador (sin límite de fecha)
    const todosCortes = await this.prisma.corteCaja.findMany({
      where: { operador_id: operadorId },
      orderBy: { fecha_corte_ejecucion: 'desc' },
    });

    // Filtrar solo cortes no corregidos
    const cortesValidos = todosCortes.filter((c) => !c.es_correccion);

    // Si no hay cortes en absoluto, solo se permite INICIO_DIA
    if (cortesValidos.length === 0) {
      if (tipoCorteSolicitado !== TipoCorte.INICIO_DIA) {
        throw new ConflictException(
          `No se puede registrar ${this.getNombreCorte(tipoCorteSolicitado)} como primer corte del sistema. Debe iniciar con "Inicio de Día".`,
        );
      }
      return { permitido: true, siguienteTipo: TipoCorte.MEDIO_DIA };
    }

    const ultimoCorte = cortesValidos[0];
    const fechaUltimoCorte = DateTime.fromJSDate(
      ultimoCorte.fecha_corte_ejecucion,
    ).setZone(TIMEZONE);

    // Verificar si el último corte fue hoy
    const ultimoCorteEsHoy = fechaUltimoCorte.hasSame(inicioDia, 'day');

    // Detectar si hay días sin cerrar
    const hayDiasSinCerrar =
      !ultimoCorteEsHoy && ultimoCorte.tipo_corte !== TipoCorte.CIERRE_DIA;

    // Si el último corte fue en un día anterior y NO fue CIERRE_DIA
    if (!ultimoCorteEsHoy && ultimoCorte.tipo_corte !== TipoCorte.CIERRE_DIA) {
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
    const cortesHoy = todosCortes.filter(
      (c) =>
        DateTime.fromJSDate(c.fecha_corte_ejecucion)
          .setZone(TIMEZONE)
          .hasSame(inicioDia, 'day') && !c.es_correccion,
    );

    // Verificar si ya existe un corte del mismo tipo hoy
    const corteMismoTipo = cortesHoy.find(
      (c) => c.tipo_corte === tipoCorteSolicitado,
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
  getNombreCorte(tipo: TipoCorte): string {
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
  getSiguienteCorte(tipoActual: TipoCorte): TipoCorte | undefined {
    const indice = ORDEN_CORTES.indexOf(tipoActual);
    if (indice < ORDEN_CORTES.length - 1) {
      return ORDEN_CORTES[indice + 1];
    }
    return undefined;
  }
}
