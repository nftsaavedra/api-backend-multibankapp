/**
 * Constantes compartidas de la aplicación
 * Centraliza magic numbers y valores de configuración
 */

// Zona horaria de la aplicación
export const TIMEZONE = 'America/Lima' as const;

// Límites operativos
export const CORTES = {
  // Secuencia de tipos de corte
  ORDEN: ['INICIO_DIA', 'MEDIO_DIA', 'INICIO_TARDE', 'CIERRE_DIA'] as const,

  // Umbrales
  MINIMO_KASNET: 350, // Operaciones mínimas diarias para Cierre Día
  UMBRAL_DIFERENCIA: 0.01, // Diferencia mínima para considerar ajuste
  MINIMO_OPERACIONES: 0, // Mínimo operativo para otros cortes

  // Nombres legibles
  NOMBRES: {
    INICIO_DIA: 'Inicio de Día',
    MEDIO_DIA: 'Medio Día',
    INICIO_TARDE: 'Inicio de Tarde',
    CIERRE_DIA: 'Cierre de Día',
  } as const,
} as const;

// Autenticación
export const AUTH = {
  ACCESS_TOKEN_EXPIRY: '8h' as const,
  REFRESH_TOKEN_EXPIRY_DAYS: 7 as const,
  MIN_PASSWORD_LENGTH: 8 as const,
  MIN_USERNAME_LENGTH: 3 as const,
} as const;

// API
export const API = {
  TIMEOUT: 30000, // 30 segundos
  RETRY_ATTEMPTS: 3,
} as const;

// Sincronización
export const SYNC = {
  INTERVAL_MS: 30000, // 30 segundos
  HEALTH_CHECK_TIMEOUT: 5000, // 5 segundos
} as const;

// Caché
export const CACHE = {
  ENTITIES_TTL: 5 * 60 * 1000, // 5 minutos
} as const;
