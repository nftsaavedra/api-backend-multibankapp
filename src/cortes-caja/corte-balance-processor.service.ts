import { Injectable } from '@nestjs/common';
import { EntidadFinanciera, Prisma } from '@prisma/client';
import { esTipoEfectivo } from '../core/constants';

// Tipo para transacciones Prisma
type TxClient = Prisma.TransactionClient;

export interface SaldoEntidadProcesado {
  entidadId: string;
  declarado: number;
  sistema: number;
  diferencia: number;
}

export interface TotalesCorte {
  totalEfectivoDeclarado: number;
  totalDigitalDeclarado: number;
  totalEfectivoSistema: number;
  totalDigitalSistema: number;
  diferenciaEfectivo: number;
  diferenciaDigital: number;
}

export interface SaldoEntidadInput {
  entidadId: string;
  saldoDeclarado: number;
}

/**
 * Servicio especializado en procesamiento de saldos de corte de caja
 * SRP: Solo maneja cálculo y procesamiento de saldos por entidad
 */
@Injectable()
export class CorteBalanceProcessorService {

  /**
   * Procesa saldos declarados por entidad y calcula totales
   */
  procesarSaldosEntidades(
    todasCuentas: EntidadFinanciera[],
    saldosDeclarados: SaldoEntidadInput[],
  ): {
    saldosProcesados: SaldoEntidadProcesado[];
    totales: TotalesCorte;
  } {
    const saldosProcesados: SaldoEntidadProcesado[] = [];
    let totalEfectivoDeclarado = 0;
    let totalDigitalDeclarado = 0;
    let totalEfectivoSistema = 0;
    let totalDigitalSistema = 0;

    for (const saldoEntidad of saldosDeclarados) {
      const cuenta = todasCuentas.find((c) => c.id === saldoEntidad.entidadId);
      if (!cuenta) continue;

      const saldoSistema = Number(cuenta.saldo_actual);
      const diferencia = saldoEntidad.saldoDeclarado - saldoSistema;

      saldosProcesados.push({
        entidadId: cuenta.id,
        declarado: saldoEntidad.saldoDeclarado,
        sistema: saldoSistema,
        diferencia,
      });

      // Clasificar para totales
      const esEfectivo = esTipoEfectivo(cuenta.tipo);
      if (esEfectivo) {
        totalEfectivoDeclarado += saldoEntidad.saldoDeclarado;
        totalEfectivoSistema += saldoSistema;
      } else {
        totalDigitalDeclarado += saldoEntidad.saldoDeclarado;
        totalDigitalSistema += saldoSistema;
      }
    }

    const totales: TotalesCorte = {
      totalEfectivoDeclarado,
      totalDigitalDeclarado,
      totalEfectivoSistema,
      totalDigitalSistema,
      diferenciaEfectivo: totalEfectivoDeclarado - totalEfectivoSistema,
      diferenciaDigital: totalDigitalDeclarado - totalDigitalSistema,
    };

    return { saldosProcesados, totales };
  }

  /**
   * Ajusta saldos de entidades cuando hay diferencias significativas
   */
  async ajustarDiferencias(
    tx: TxClient,
    saldosProcesados: SaldoEntidadProcesado[],
    _totales: TotalesCorte,
    _todasCuentas: EntidadFinanciera[],
    umbral = 0.01,
  ): Promise<void> {
    for (const saldoProc of saldosProcesados) {
      if (Math.abs(saldoProc.diferencia) > umbral) {
        await tx.entidadFinanciera.update({
          where: { id: saldoProc.entidadId },
          data: { saldo_actual: { increment: saldoProc.diferencia } },
        });
      }
    }
  }

  /**
   * Genera observaciones automáticas basadas en diferencias y validaciones
   */
  generarObservaciones(
    tipoCorte: string,
    operacionesKasnet: number,
    totales: TotalesCorte,
    umbralDiferencia = 0.01,
    minimoKasnet = 350,
  ): string[] {
    const observaciones: string[] = [];

    // Validar mínimo operativo
    const cumpleMinimo =
      tipoCorte !== 'CIERRE_DIA' || operacionesKasnet >= minimoKasnet;

    if (tipoCorte === 'CIERRE_DIA' && !cumpleMinimo) {
      observaciones.push(
        `Solo ${operacionesKasnet}/${minimoKasnet} operaciones diarias. Minimo no cumplido.`,
      );
    }

    // Diferencias significativas
    if (Math.abs(totales.diferenciaEfectivo) > umbralDiferencia) {
      observaciones.push(
        `Ajuste efectivo: S/${totales.diferenciaEfectivo.toFixed(2)}`,
      );
    }

    if (Math.abs(totales.diferenciaDigital) > umbralDiferencia) {
      observaciones.push(
        `Ajuste digital: S/${totales.diferenciaDigital.toFixed(2)}`,
      );
    }

    return observaciones;
  }
}
