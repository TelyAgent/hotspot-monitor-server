import { Controller, Get, Query } from '@nestjs/common'
import type { EventListResponse } from './event.types'
import { EventService } from './event.service'
import { EventQueryDto } from './dto/event-query.dto'

@Controller('event')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  /** GET /api/event — 事件列表（分页 + 状态筛选 + 关键词搜索） */
  @Get()
  getEvents(@Query() query: EventQueryDto): Promise<EventListResponse> {
    return this.eventService.getEvents(query)
  }
}
