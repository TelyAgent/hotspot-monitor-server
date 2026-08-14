import { Module } from '@nestjs/common'
import { TwitterModule } from '../twitter/twitter.module'
import { TaskController } from './task.controller'
import { TaskService } from './task.service'
import { TrackingService } from './tracking.service'

@Module({
  imports: [TwitterModule],
  controllers: [TaskController],
  providers: [TaskService, TrackingService],
  exports: [TaskService],
})
export class TaskModule {}
