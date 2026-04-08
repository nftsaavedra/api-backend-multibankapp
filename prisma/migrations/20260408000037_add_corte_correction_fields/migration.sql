/*
  Warnings:

  - A unique constraint covering the columns `[corte_anulado_id]` on the table `cortes_caja` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "cortes_caja" ADD COLUMN     "corte_anulado_id" TEXT,
ADD COLUMN     "es_correccion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivo_correccion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cortes_caja_corte_anulado_id_key" ON "cortes_caja"("corte_anulado_id");
