import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { TaskService } from './task.service'

@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  /** GET /api/task — 账号任务列表 */
  @Get()
  getTasks() {
    return this.taskService.getTasks()
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
}
