import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { TaskService } from './task.service'
import { TrackingService } from './tracking.service'
import { TaskQueryDto } from './dto/task-query.dto'

@Controller('task')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly trackingService: TrackingService,
  ) {}

  /** GET /api/task — 账号任务列表（分页 + 筛选） */
  @Get()
  getTasks(@Query() query: TaskQueryDto) {
    return this.taskService.getTasks(query)
  }

  /** GET /api/task/facets — 筛选下拉选项 */
  @Get('facets')
  getFacets() {
    return this.taskService.getFacets()
  }

  /** POST /api/task/:id/regenerate — 重新生成候选（人工重试/调整） */
  @Post(':id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    const candidates = await this.taskService.regenerateTask(id, body.instruction)
    return { status: 'ok', candidates }
  }

  /** POST /api/task/:id/publish — 回填发布 URL，启动追踪 */
  @Post(':id/publish')
  async publish(
    @Param('id') id: string,
    @Body() body: { url: string; selectedCandidate?: number },
  ) {
    await this.taskService.publishTask(id, body.url, body.selectedCandidate)
    return { status: 'ok', message: '发布已记录，开始追踪' }
  }

  /** POST /api/task/track — 手动触发一次指标抓取 */
  @Post('track')
  async track() {
    await this.trackingService.trackPublishedPosts()
    return { status: 'ok', message: '已抓取帖子指标' }
  }
}
