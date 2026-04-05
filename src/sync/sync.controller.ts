import {
  Controller,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SyncService, type SyncBatchRequest } from './sync.service';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';
import { CurrentUser, type CurrentUserPayload } from '../core/current-user.decorator';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Post()
  async syncBatch(
    @Body() request: SyncBatchRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.syncBatch(request, user.rol);
  }

  @Post('status')
  async getSyncStatus(@Body('syncIds') syncIds: string[]) {
    return this.service.getSyncStatus(syncIds);
  }
}
