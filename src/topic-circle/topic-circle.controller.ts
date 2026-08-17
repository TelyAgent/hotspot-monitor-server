import { Controller, Get, Post, Query } from '@nestjs/common'
import { TopicCircleService } from './topic-circle.service'

@Controller('topic-circle')
export class TopicCircleController {
  constructor(private readonly service: TopicCircleService) {}

  /** GET /api/topic-circle?circle=... — 查询总结出的话题 */
  @Get()
  getTopics(@Query('circle') circle?: string) {
    return this.service.getTopics(circle)
  }

  /** POST /api/topic-circle/collect — 手动触发一次主题圈采集（用于测试/调试） */
  @Post('collect')
  collect() {
    return this.service.collectAll()
  }

  /** POST /api/topic-circle/summarize — 手动触发一次话题总结 */
  @Post('summarize')
  summarize() {
    return this.service.summarizeTopics()
  }

  /** POST /api/topic-circle/metrics — 手动触发一次关注度计算 */
  @Post('metrics')
  metrics() {
    return this.service.computeMetrics()
  }

  /** POST /api/topic-circle/trigger — 手动触发一次触发判断 */
  @Post('trigger')
  trigger() {
    return this.service.evaluateTriggers()
  }
}
