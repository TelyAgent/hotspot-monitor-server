import { Controller, Get, Post, Query } from '@nestjs/common'
import { TrendingQueryDto } from './dto/trending-query.dto'
import type { TrendingResponse } from './interfaces/trending.interface'
import { MonitorService } from './monitor.service'

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  /**
   * GET /api/monitor/trending?region=Worldwide&limit=30
   * 获取指定地区热搜排行榜前 N 条
   */
  @Get('trending')
  getTrending(@Query() query: TrendingQueryDto): Promise<TrendingResponse> {
    return this.monitorService.getTrending(query)
  }

  /**
   * POST /api/monitor/refresh
   * 触发立即采集（对应前端「立即采集」按钮）
   */
  @Post('refresh')
  refresh() {
    return this.monitorService.refresh()
  }
}
