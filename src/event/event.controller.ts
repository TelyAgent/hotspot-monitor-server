import { Controller, Get } from '@nestjs/common'
import type { EventItem } from './event.types'
import { EventService } from './event.service'

@Controller('event')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  /** GET /api/event — 事件列表（含依据、关联） */
  @Get()
  getEvents(): Promise<EventItem[]> {
    return this.eventService.getEvents()
  }
}
