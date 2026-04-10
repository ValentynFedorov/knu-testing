import { Body, Controller, Post } from '@nestjs/common';
import { IntegrityService } from './integrity.service';
import { LogIntegrityEventDto } from '../attempts/dto/attempts.dto';

@Controller('integrity')
export class IntegrityController {
  constructor(private readonly integrityService: IntegrityService) {}

  @Post('events')
  logEvent(@Body() dto: LogIntegrityEventDto) {
    return this.integrityService.logEvent(dto);
  }
}
