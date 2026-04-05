-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('OPERADOR', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "TipoCorte" AS ENUM ('INICIO_DIA', 'MEDIO_DIA', 'INICIO_TARDE', 'CIERRE_DIA');

-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('NO_CONCILIADO', 'CONCILIADO');

-- CreateEnum
CREATE TYPE "EstadoMovimiento" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entidades_financieras" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "saldo_actual" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "entidades_financieras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cortes_caja" (
    "id" TEXT NOT NULL,
    "operador_id" TEXT NOT NULL,
    "tipo_corte" "TipoCorte" NOT NULL,
    "fecha_inicio_bloque" TIMESTAMPTZ(3) NOT NULL,
    "fecha_corte_ejecucion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saldo_efectivo_declarado" DECIMAL(10,2) NOT NULL,
    "saldo_digital_declarado" DECIMAL(10,2) NOT NULL,
    "excedente_comision" DECIMAL(10,2) NOT NULL,
    "operaciones_kasnet" INTEGER NOT NULL,
    "ia_fingerprint" TEXT,

    CONSTRAINT "cortes_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_administrativos" (
    "id" TEXT NOT NULL,
    "operador_id" TEXT NOT NULL,
    "corte_id" TEXT,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "estado_aprobacion" "EstadoMovimiento" NOT NULL DEFAULT 'APROBADO',
    "estado_conciliacion" "EstadoConciliacion" NOT NULL DEFAULT 'NO_CONCILIADO',
    "cuenta_origen_id" TEXT NOT NULL,
    "cuenta_destino_id" TEXT NOT NULL,
    "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobado_por" TEXT,
    "sync_id" TEXT,

    CONSTRAINT "movimientos_administrativos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "entidades_financieras_nombre_key" ON "entidades_financieras"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_administrativos_sync_id_key" ON "movimientos_administrativos"("sync_id");

-- AddForeignKey
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_corte_id_fkey" FOREIGN KEY ("corte_id") REFERENCES "cortes_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "entidades_financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "entidades_financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
