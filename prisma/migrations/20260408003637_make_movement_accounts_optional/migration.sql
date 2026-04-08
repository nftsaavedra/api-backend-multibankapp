-- DropForeignKey
ALTER TABLE "movimientos_administrativos" DROP CONSTRAINT "movimientos_administrativos_cuenta_destino_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_administrativos" DROP CONSTRAINT "movimientos_administrativos_cuenta_origen_id_fkey";

-- AlterTable
ALTER TABLE "movimientos_administrativos" ALTER COLUMN "cuenta_origen_id" DROP NOT NULL,
ALTER COLUMN "cuenta_destino_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "entidades_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "entidades_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
