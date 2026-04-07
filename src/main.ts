import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';

// Cargar variables de entorno antes de cualquier otra cosa
dotenv.config();

// AllExceptionsFilter and DateTransformInterceptor are now provided by CoreModule

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters and interceptors are configured in CoreModule

  // CORS configurado para múltiples clientes (Desktop, Mobile, Web)
  // En producción, configurar ALLOWED_ORIGINS con dominios específicos
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:1420', // Tauri dev
        'http://localhost:5173', // Vite dev
        'http://localhost:3000', // Next.js/React dev
        'http://localhost:8080', // Alternative dev port
        'tauri://localhost', // Tauri production
        'capacitor://localhost', // Capacitor mobile
        'ionic://localhost', // Ionic mobile
      ];

  app.enableCors({
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Permitir requests sin origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Requested-With,Accept,Origin',
    exposedHeaders: 'Content-Length,Content-Range,X-Total-Count',
    credentials: true,
    maxAge: 86400, // 24 horas
  });

  // Security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}
void bootstrap();
