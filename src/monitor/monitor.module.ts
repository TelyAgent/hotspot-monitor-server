import { Module } from '@nestjs/common'
import { TwitterModule } from '../twitter/twitter.module'
import { SignalModule } from '../signal/signal.module'
import { TriggerModule } from '../trigger/trigger.module'
import { EventModule } from '../event/event.module'
import { TaskModule } from '../task/task.module'
import { MonitorController } from './monitor.controller'
import { MonitorService } from './monitor.service'

@Module({
  imports: [TwitterModule, SignalModule, TriggerModule, EventModule, TaskModule],
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
