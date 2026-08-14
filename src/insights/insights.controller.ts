import { Controller, Get, Query } from '@nestjs/common'
import { InsightsService } from './insights.service'

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  /** GET /api/insights?range=7d|30d|1y — 复盘聚合数据 */
  @Get()
  getInsights(@Query('range') range = '7d') {
    return this.insightsService.getInsights(range)
  }
}
