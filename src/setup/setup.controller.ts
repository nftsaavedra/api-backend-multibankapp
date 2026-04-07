import { Controller, Get, Post, Body, ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import {
  SetupService,
  type SetupStatus,
  type SetupResult,
} from './setup.service';
import { IsString, MinLength } from 'class-validator';

class InitSetupDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async getStatus(): Promise<SetupStatus> {
    return this.setupService.getStatus();
  }

  @Post('init')
  async initialize(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: InitSetupDto,
  ): Promise<SetupResult> {
    // Verificar que el sistema no haya sido inicializado previamente
    const status = await this.setupService.getStatus();
    if (status.initialized) {
      throw new HttpException(
        'El sistema ya ha sido inicializado',
        HttpStatus.CONFLICT,
      );
    }
    return this.setupService.initialize(dto);
  }
}
