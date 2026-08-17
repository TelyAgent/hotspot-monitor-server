import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import {
  CreateFutureEventPayload,
  FutureEventsService,
} from './future-events.service'

@Controller('future-events')
export class FutureEventsController {
  constructor(private readonly service: FutureEventsService) {}

  /** GET /api/future-events?month=YYYY-MM | unassigned=true */
  @Get()
  list(@Query() query: { month?: string; unassigned?: string }) {
    return this.service.getFutureEvents({
      month: query.month,
      unassigned: query.unassigned === 'true',
    })
  }

  /** GET /api/future-events/sources/status */
  @Get('sources/status')
  sourceStatus() {
    return this.service.getSourceSyncStatus()
  }

  /** POST /api/future-events/import */
  @Post('import')
  import(@Body() body: { csv?: string }) {
    return this.service.importFutureEvents(body.csv ?? '')
  }

  /** POST /api/future-events/sources/:source/resync */
  @Post('sources/:source/resync')
  resync(@Param('source') source: string) {
    return this.service.resyncSource(source)
  }

  /** POST /api/future-events/:id/respond */
  @Post(':id/respond')
  respond(@Param('id') id: string, @Body() body: { kind: string }) {
    return this.service.respondFutureEvent(id, body.kind)
  }

  /** GET /api/future-events/:id/heat */
  @Get(':id/heat')
  heat(@Param('id') id: string) {
    return this.service.getFutureEventHeat(id)
  }

  /** GET /api/future-events/:id */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.getFutureEvent(id)
  }

  /** POST /api/future-events */
  @Post()
  create(@Body() body: CreateFutureEventPayload) {
    return this.service.createFutureEvent(body)
  }

  /** PUT /api/future-events/:id */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateFutureEventPayload>) {
    return this.service.updateFutureEvent(id, body)
  }

  /** DELETE /api/future-events/:id */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.deleteFutureEvent(id)
  }
}
