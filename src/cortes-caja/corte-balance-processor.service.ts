import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EntidadFinanciera, Prisma } from '@prisma/client';
import { BalanceAdjusterService } from './balance-adjuster.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceAdjuster: BalanceAdjusterService,
  ) {}

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
      const esEfectivo =
        cuenta.tipo.includes('EFECTIVO') || cuenta.tipo.includes('CAJA');
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
   * Procesa saldos legacy (efectivo/digital directo)
   */
  procesarSaldosLegacy(
    todasCuentas: EntidadFinanciera[],
    saldoEfectivoDeclarado: number,
    saldoDigitalDeclarado: number,
  ): TotalesCorte {
    const cuentasEfectivo = todasCuentas.filter(
      (c) =>
        c.tipo.includes('EFECTIVO') || c.tipo.includes('CAJA'),
    );
    const cuentasDigital = todasCuentas.filter(
      (c) =>
        !c.tipo.includes('EFECTIVO') && !c.tipo.includes('CAJA'),
    );

    const totalEfectivoSistema = cuentasEfectivo.reduce(
      (sum, c) => sum + Number(c.saldo_actual),
      0,
    );
    const totalDigitalSistema = cuentasDigital.reduce(
      (sum, c) => sum + Number(c.saldo_actual),
      0,
    );

    return {
      totalEfectivoDeclarado: saldoEfectivoDeclarado,
      totalDigitalDeclarado: saldoDigitalDeclarado,
      totalEfectivoSistema,
      totalDigitalSistema,
      diferenciaEfectivo: saldoEfectivoDeclarado - totalEfectivoSistema,
      diferenciaDigital: saldoDigitalDeclarado - totalDigitalSistema,
    };
  }

  /**
   * Ajusta saldos de entidades cuando hay diferencias significativas
   */
  async ajustarDiferencias(
    tx: TxClient,
    saldosProcesados: SaldoEntidadProcesado[],
    totales: TotalesCorte,
    todasCuentas: EntidadFinanciera[],
    umbral = 0.01,
  ): Promise<void> {
    // Ajustar cada entidad individualmente si hay saldos detallados
    if (saldosProcesados.length > 0) {
      for (const saldoProc of saldosProcesados) {
        if (Math.abs(saldoProc.diferencia) > umbral) {
          await tx.entidadFinanciera.update({
            where: { id: saldoProc.entidadId },
            data: { saldo_actual: { increment: saldoProc.diferencia } },
          });
        }
      }
      return;
    }

    // Si no hay saldos detallados, usar método legacy proporcional
    if (Math.abs(totales.diferenciaEfectivo) > umbral) {
      const cuentasEfectivo = todasCuentas.filter(
        (c) =>
          c.tipo.includes('EFECTIVO') || c.tipo.includes('CAJA'),
      );
      await this.balanceAdjuster.adjustProportionally(
        tx,
        cuentasEfectivo,
        totales.diferenciaEfectivo,
      );
    }

    if (Math.abs(totales.diferenciaDigital) > umbral) {
      const cuentasDigital = todasCuentas.filter(
        (c) =>
          !c.tipo.includes('EFECTIVO') && !c.tipo.includes('CAJA'),
      );
      await this.balanceAdjuster.adjustProportionally(
        tx,
        cuentasDigital,
        totales.diferenciaDigital,
      );
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
        `⚠️ Solo ${operacionesKasnet}/${minimoKasnet} operaciones diarias. Mínimo no cumplido.`,
      );
    }

    // Diferencias significativas
    if (Math.abs(totales.diferenciaEfectivo) > umbralDiferencia) {
      observaciones.push(
        `📊 Ajuste efectivo: S/${totales.diferenciaEfectivo.toFixed(2)}`,
      );
    }

    if (Math.abs(totales.diferenciaDigital) > umbralDiferencia) {
      observaciones.push(
        `📊 Ajuste digital: S/${totales.diferenciaDigital.toFixed(2)}`,
      );
    }

    return observaciones;
  }
}
