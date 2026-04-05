import {
  IsArray,
  IsString,
  ArrayMinSize,
} from 'class-validator';

export class SyncStatusRequestDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  syncIds: string[];
}
