import { Module } from '@nestjs/common'
import { TwitterModule } from '../twitter/twitter.module'
import { MonitorController } from './monitor.controller'
import { MonitorService } from './monitor.service'

@Module({
  imports: [TwitterModule],
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
