import { Module } from '@nestjs/common'
import { TwitterModule } from '../twitter/twitter.module'
import { TaskModule } from '../task/task.module'
import { TopicCircleController } from './topic-circle.controller'
import { TopicCircleService } from './topic-circle.service'

@Module({
  imports: [TwitterModule, TaskModule],
  controllers: [TopicCircleController],
  providers: [TopicCircleService],
})
export class TopicCircleModule {}
