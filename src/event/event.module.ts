import { Module } from '@nestjs/common'
import { TwitterModule } from '../twitter/twitter.module'
import { EventController } from './event.controller'
import { EventService } from './event.service'

@Module({
  imports: [TwitterModule],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
