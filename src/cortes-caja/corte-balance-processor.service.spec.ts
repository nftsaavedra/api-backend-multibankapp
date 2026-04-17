import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { CorteBalanceProcessorService } from './corte-balance-processor.service';
import { EntidadFinanciera } from '@prisma/client';
import type { SaldoEntidadInput, TotalesCorte, SaldoEntidadProcesado } from './corte-balance-processor.service';

describe('CorteBalanceProcessorService', () => {
  let service: CorteBalanceProcessorService;

  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorteBalanceProcessorService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CorteBalanceProcessorService>(CorteBalanceProcessorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('procesarSaldosEntidades', () => {
    it('debe procesar saldos por entidad correctamente', () => {
      const cuentas = [
        {
          id: 'entidad-1',
          tipo: 'CAJA PRINCIPAL',
          saldo_actual: 1000.0,
        },
        {
          id: 'entidad-2',
          tipo: 'BIM DIGITAL',
          saldo_actual: 500.0,
        },
      ];

      const saldosDeclarados = [
        { entidadId: 'entidad-1', saldoDeclarado: 1050.0 },
        { entidadId: 'entidad-2', saldoDeclarado: 480.0 },
      ];

      const result = service.procesarSaldosEntidades(cuentas as unknown as EntidadFinanciera[], saldosDeclarados as SaldoEntidadInput[]);

      expect(result.saldosProcesados).toHaveLength(2);
      expect(result.saldosProcesados[0].diferencia).toBe(50.0);
      expect(result.saldosProcesados[1].diferencia).toBe(-20.0);
      expect(result.totales.totalEfectivoDeclarado).toBe(1050.0);
      expect(result.totales.totalDigitalDeclarado).toBe(480.0);
    });

    it('debe clasificar correctamente efectivo vs digital', () => {
      const cuentas = [
        { id: 'caja-1', tipo: 'CAJA EFECTIVO', saldo_actual: 200 },
        { id: 'bim-1', tipo: 'BIM', saldo_actual: 300 },
        { id: 'kasnet-1', tipo: 'KASNET POS', saldo_actual: 150 },
      ] as unknown as EntidadFinanciera[];

      const saldosDeclarados: SaldoEntidadInput[] = [
        { entidadId: 'caja-1', saldoDeclarado: 220.0 },
        { entidadId: 'bim-1', saldoDeclarado: 290.0 },
        { entidadId: 'kasnet-1', saldoDeclarado: 150.0 },
      ];

      const result = service.procesarSaldosEntidades(cuentas as unknown as EntidadFinanciera[], saldosDeclarados as SaldoEntidadInput[]);

      expect(result.totales.totalEfectivoDeclarado).toBe(220.0);
      expect(result.totales.totalDigitalDeclarado).toBe(440.0);
    });
  });

  describe('generarObservaciones', () => {
    it('debe generar advertencia por mínimo operativo no cumplido', () => {
      const totales = {
        totalEfectivoDeclarado: 1000,
        totalDigitalDeclarado: 500,
        totalEfectivoSistema: 1000,
        totalDigitalSistema: 500,
        diferenciaEfectivo: 0,
        diferenciaDigital: 0,
      };

      const observaciones = service.generarObservaciones(
        'CIERRE_DIA',
        200, // operaciones Kasnet (mínimo 350)
        totales,
      );

      expect(observaciones).toHaveLength(1);
      expect(observaciones[0]).toContain('200/350');
    });

    it('debe generar observaciones por diferencias significativas', () => {
      const totales = {
        totalEfectivoDeclarado: 1050,
        totalDigitalDeclarado: 480,
        totalEfectivoSistema: 1000,
        totalDigitalSistema: 500,
        diferenciaEfectivo: 50,
        diferenciaDigital: -20,
      };

      const observaciones = service.generarObservaciones(
        'MEDIO_DIA',
        400,
        totales,
      );

      expect(observaciones).toHaveLength(2);
      expect(observaciones[0]).toContain('Ajuste efectivo');
      expect(observaciones[1]).toContain('Ajuste digital');
    });

    it('no debe generar observaciones si no hay diferencias', () => {
      const totales = {
        totalEfectivoDeclarado: 1000,
        totalDigitalDeclarado: 500,
        totalEfectivoSistema: 1000,
        totalDigitalSistema: 500,
        diferenciaEfectivo: 0,
        diferenciaDigital: 0,
      };

      const observaciones = service.generarObservaciones(
        'MEDIO_DIA',
        400,
        totales,
      );

      expect(observaciones).toHaveLength(0);
    });
  });

  describe('ajustarDiferencias', () => {
    it('debe ajustar cada entidad individualmente cuando hay saldos detallados', async () => {
      const mockTx = {
        entidadFinanciera: {
          update: jest.fn(),
        },
      };

      const saldosProcesados: SaldoEntidadProcesado[] = [
        {
          entidadId: 'entidad-1',
          declarado: 1050,
          sistema: 1000,
          diferencia: 50,
        },
        {
          entidadId: 'entidad-2',
          declarado: 480,
          sistema: 500,
          diferencia: -20,
        },
      ];

      const totales: TotalesCorte = {
        totalEfectivoDeclarado: 1530,
        totalDigitalDeclarado: 0,
        totalEfectivoSistema: 1500,
        totalDigitalSistema: 0,
        diferenciaEfectivo: 30,
        diferenciaDigital: 0,
      };

      await service.ajustarDiferencias(
        mockTx as unknown as Parameters<typeof service.ajustarDiferencias>[0],
        saldosProcesados,
        totales,
        [],
      );

      expect(mockTx.entidadFinanciera.update).toHaveBeenCalledTimes(2);
    });
  });
});
