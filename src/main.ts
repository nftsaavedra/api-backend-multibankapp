import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
// AllExceptionsFilter and DateTransformInterceptor are now provided by CoreModule

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

// Global filters and interceptors are configured in CoreModule

  app.enableCors({
    origin: ['http://localhost:1420', 'tauri://localhost'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
