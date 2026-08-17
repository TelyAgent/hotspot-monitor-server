import { Module } from '@nestjs/common'
import { FutureEventsController } from './future-events.controller'
import { FutureEventsService } from './future-events.service'

@Module({
  controllers: [FutureEventsController],
  providers: [FutureEventsService],
})
export class FutureEventsModule {}
