import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { LlmModule } from './llm/llm.module'
import { EmbeddingModule } from './embedding/embedding.module'
import { MonitorModule } from './monitor/monitor.module'
import { AccountModule } from './account/account.module'
import { TaskModule } from './task/task.module'
import { InsightsModule } from './insights/insights.module'
import { SettingsModule } from './settings/settings.module'
import { FutureEventsModule } from './future-events/future-events.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    LlmModule,
    EmbeddingModule,
    AccountModule,
    TaskModule,
    InsightsModule,
    SettingsModule,
    FutureEventsModule,
    MonitorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
