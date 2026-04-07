import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncBatchRequestDto, SyncStatusRequestDto } from './dto';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Post()
  async syncBatch(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    request: SyncBatchRequestDto,
  ) {
    return this.service.syncBatch(request);
  }

  @Post('status')
  async getSyncStatus(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: SyncStatusRequestDto,
  ) {
    return this.service.getSyncStatus(dto.syncIds);
  }
}
