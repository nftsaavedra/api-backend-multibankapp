-- AlterTable
ALTER TABLE "cortes_caja" ADD COLUMN     "cumple_minimo_operativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "diferencia_digital" DECIMAL(10,2),
ADD COLUMN     "diferencia_efectivo" DECIMAL(10,2),
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "saldo_digital_sistema" DECIMAL(10,2),
ADD COLUMN     "saldo_efectivo_sistema" DECIMAL(10,2);
