import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CorteSequenceValidatorService } from './corte-sequence-validator.service';
import { TipoCorte } from '@prisma/client';

describe('CorteSequenceValidatorService', () => {
  let service: CorteSequenceValidatorService;

  const mockPrisma = {
    corteCaja: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorteSequenceValidatorService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CorteSequenceValidatorService>(CorteSequenceValidatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validarSecuencia', () => {
    it('debe permitir correcciones con advertencia', async () => {
      const result = await service.validarSecuencia(
        'operador-1',
        TipoCorte.INICIO_DIA,
        true,
      );

      expect(result.permitido).toBe(true);
      expect(result.advertencia).toContain('corrección');
    });

    it('debe requerir INICIO_DIA como primer corte del sistema', async () => {
      mockPrisma.corteCaja.findMany.mockResolvedValue([]);

      await expect(
        service.validarSecuencia('operador-1', TipoCorte.MEDIO_DIA),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.validarSecuencia('operador-1', TipoCorte.INICIO_DIA),
      ).resolves.toEqual({
        permitido: true,
        siguienteTipo: TipoCorte.MEDIO_DIA,
      });
    });

    it('debe detectar días sin cerrar y requerir INICIO_DIA', async () => {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);

      mockPrisma.corteCaja.findMany.mockResolvedValue([
        {
          id: 'corte-1',
          operador_id: 'operador-1',
          tipo_corte: TipoCorte.MEDIO_DIA,
          fecha_corte_ejecucion: ayer,
          es_correccion: false,
        },
      ]);

      await expect(
        service.validarSecuencia('operador-1', TipoCorte.MEDIO_DIA),
      ).rejects.toThrow(ConflictException);

      const result = await service.validarSecuencia(
        'operador-1',
        TipoCorte.INICIO_DIA,
      );

      expect(result.permitido).toBe(true);
      expect(result.advertencia).toContain('cierre automático');
    });

    it('debe permitir INICIO_DIA después de CIERRE_DIA de día anterior', async () => {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);

      mockPrisma.corteCaja.findMany.mockResolvedValue([
        {
          id: 'corte-1',
          operador_id: 'operador-1',
          tipo_corte: TipoCorte.CIERRE_DIA,
          fecha_corte_ejecucion: ayer,
          es_correccion: false,
        },
      ]);

      const result = await service.validarSecuencia(
        'operador-1',
        TipoCorte.INICIO_DIA,
      );

      expect(result.permitido).toBe(true);
      expect(result.siguienteTipo).toBe(TipoCorte.MEDIO_DIA);
    });

    it('debe validar secuencia correcta del mismo día', async () => {
      const hoy = new Date();

      mockPrisma.corteCaja.findMany.mockResolvedValue([
        {
          id: 'corte-1',
          operador_id: 'operador-1',
          tipo_corte: TipoCorte.INICIO_DIA,
          fecha_corte_ejecucion: hoy,
          es_correccion: false,
        },
      ]);

      const result = await service.validarSecuencia(
        'operador-1',
        TipoCorte.MEDIO_DIA,
      );

      expect(result.permitido).toBe(true);
      expect(result.siguienteTipo).toBe(TipoCorte.INICIO_TARDE);
    });

    it('debe rechazar corte fuera de secuencia', async () => {
      const hoy = new Date();

      mockPrisma.corteCaja.findMany.mockResolvedValue([
        {
          id: 'corte-1',
          operador_id: 'operador-1',
          tipo_corte: TipoCorte.INICIO_DIA,
          fecha_corte_ejecucion: hoy,
          es_correccion: false,
        },
      ]);

      // Intentar INICIO_DIA de nuevo (ya existe)
      await expect(
        service.validarSecuencia('operador-1', TipoCorte.INICIO_DIA),
      ).rejects.toThrow(ConflictException);
    });

    it('debe advertir cuando se salta un corte', async () => {
      const hoy = new Date();

      mockPrisma.corteCaja.findMany.mockResolvedValue([
        {
          id: 'corte-1',
          operador_id: 'operador-1',
          tipo_corte: TipoCorte.INICIO_DIA,
          fecha_corte_ejecucion: hoy,
          es_correccion: false,
        },
      ]);

      // Saltar MEDIO_DIA e ir directo a INICIO_TARDE
      const result = await service.validarSecuencia(
        'operador-1',
        TipoCorte.INICIO_TARDE,
      );

      expect(result.permitido).toBe(true);
      expect(result.advertencia).toContain('saltando');
    });
  });

  describe('getNombreCorte', () => {
    it('debe retornar nombres legibles', () => {
      expect(service.getNombreCorte(TipoCorte.INICIO_DIA)).toBe('Inicio de Día');
      expect(service.getNombreCorte(TipoCorte.MEDIO_DIA)).toBe('Medio Día');
      expect(service.getNombreCorte(TipoCorte.INICIO_TARDE)).toBe('Inicio de Tarde');
      expect(service.getNombreCorte(TipoCorte.CIERRE_DIA)).toBe('Cierre de Día');
    });
  });

  describe('getSiguienteCorte', () => {
    it('debe retornar el siguiente corte en secuencia', () => {
      expect(service.getSiguienteCorte(TipoCorte.INICIO_DIA)).toBe(TipoCorte.MEDIO_DIA);
      expect(service.getSiguienteCorte(TipoCorte.MEDIO_DIA)).toBe(TipoCorte.INICIO_TARDE);
      expect(service.getSiguienteCorte(TipoCorte.INICIO_TARDE)).toBe(TipoCorte.CIERRE_DIA);
    });

    it('debe retornar undefined para el último corte', () => {
      expect(service.getSiguienteCorte(TipoCorte.CIERRE_DIA)).toBeUndefined();
    });
  });
});
