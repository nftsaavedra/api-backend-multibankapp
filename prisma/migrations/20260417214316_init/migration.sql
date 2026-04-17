-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('OPERADOR', 'ADMIN');

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
    "es_cuenta_comision" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "entidades_financieras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cortes_caja" (
    "id" TEXT NOT NULL,
    "operador_id" TEXT NOT NULL,
    "tipo_corte" "TipoCorte" NOT NULL,
    "fecha_inicio_bloque" TIMESTAMPTZ(3) NOT NULL,
    "fecha_corte_ejecucion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saldo_efectivo_declarado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo_digital_declarado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "excedente_comision" DECIMAL(10,2) NOT NULL,
    "operaciones_kasnet" INTEGER NOT NULL,
    "saldo_efectivo_sistema" DECIMAL(10,2),
    "saldo_digital_sistema" DECIMAL(10,2),
    "diferencia_efectivo" DECIMAL(10,2),
    "diferencia_digital" DECIMAL(10,2),
    "cumple_minimo_operativo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "es_correccion" BOOLEAN NOT NULL DEFAULT false,
    "motivo_correccion" TEXT,
    "corte_anulado_id" TEXT,
    "ia_fingerprint" TEXT,

    CONSTRAINT "cortes_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cortes_entidades_saldos" (
    "id" TEXT NOT NULL,
    "corte_id" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "saldo_declarado" DECIMAL(10,2) NOT NULL,
    "saldo_sistema" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "cortes_entidades_saldos_pkey" PRIMARY KEY ("id")
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
    "cuenta_origen_id" TEXT,
    "cuenta_destino_id" TEXT,
    "fecha_registro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobado_por" TEXT,
    "sync_id" TEXT,

    CONSTRAINT "movimientos_administrativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "entidades_financieras_nombre_key" ON "entidades_financieras"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cortes_caja_corte_anulado_id_key" ON "cortes_caja"("corte_anulado_id");

-- CreateIndex
CREATE UNIQUE INDEX "cortes_entidades_saldos_corte_id_entidad_id_key" ON "cortes_entidades_saldos"("corte_id", "entidad_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_administrativos_sync_id_key" ON "movimientos_administrativos"("sync_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- AddForeignKey
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_entidades_saldos" ADD CONSTRAINT "cortes_entidades_saldos_corte_id_fkey" FOREIGN KEY ("corte_id") REFERENCES "cortes_caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_entidades_saldos" ADD CONSTRAINT "cortes_entidades_saldos_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "entidades_financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_corte_id_fkey" FOREIGN KEY ("corte_id") REFERENCES "cortes_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "entidades_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "entidades_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_administrativos" ADD CONSTRAINT "movimientos_administrativos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
