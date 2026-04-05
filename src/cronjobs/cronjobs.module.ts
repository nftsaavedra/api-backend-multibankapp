import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronjobsService } from './cronjobs.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CronjobsService],
})
export class CronjobsModule {}
