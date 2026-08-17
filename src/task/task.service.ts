import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LlmService } from '../llm/llm.service'
import { Prisma } from '@prisma/client'
import type { Account, Event, Task } from '@prisma/client'
import { TaskQueryDto } from './dto/task-query.dto'

const PARTICIPATE_SYSTEM_PROMPT = `你是账号响应判断助手。给定一个事件和一批人设账号（每个账号有定位和人设），判断哪些账号应该参与响应这个事件。只有事件明显匹配账号定位才参与，否则跳过。

只输出 JSON：{"decisions":[{"key":0,"participate":true}]}`

const GENERATE_SYSTEM_PROMPT = `你是热点内容生成助手。给定一批账号任务，为每个任务生成 3 条候选内容。

规则：
- 快讯账号：1-2 句事实更新，不做分析、不关联产品，可用 JUST IN/快讯 等标签。
- 长文账号：分析型内容，补充背景、解释概念和关注原因，100-180 词。
- 产品承接账号：关联 PredX 预测市场，不得编造功能/市场/价格/概率。
- 人设账号：按账号人设的表达方式。
- 不写虚构事实；不确定的用「据报道」「多个帖子称」等限定。

只输出 JSON：{"tasks":[{"key":0,"candidates":["...","...","..."]}]}`

const GENERATE_SINGLE_SYSTEM_PROMPT = `你是热点内容生成助手。根据账号人设和事件，生成 3 条候选内容。

规则：
- 快讯账号：1-2 句事实更新，不做分析、不关联产品，可用 JUST IN/快讯 等标签。
- 长文账号：分析型内容，补充背景、解释概念和关注原因，100-180 词。
- 产品承接账号：关联 PredX 预测市场，不得编造功能/市场/价格/概率。
- 人设账号：按账号人设的表达方式。
- 不写虚构事实；不确定的用「据报道」「多个帖子称」等限定。
- 如果用户给了调整要求，必须遵循。

只输出 JSON：{"candidates":["...","...","..."]}`

interface Assignment {
  event: Event
  account: Account
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** 对一次采集形成的 Event 做账号分配 + 候选生成 */
  async assignAndGenerate(snapshotId: string): Promise<number> {
    const events = await this.findSnapshotEvents(snapshotId)
    if (events.length === 0) return 0

    const accounts = await this.prisma.account.findMany()
    if (accounts.length === 0) return 0

    // 1. 决定分配：基础层全接，人设层 LLM 判断
    const assignments = await this.decideAssignments(events, accounts)
    if (assignments.length === 0) return 0

    // 2. 创建 Task（去重：同 event+account 只建一次）
    const created: Array<{ id: string; key: number; account: Account; event: Event }> = []
    for (const [i, a] of assignments.entries()) {
      const existing = await this.prisma.task.findUnique({
        where: { eventId_accountId: { eventId: a.event.id, accountId: a.account.id } },
      })
      if (existing) continue
      const task = await this.prisma.task.create({
        data: {
          code: `T-${1080 + i}`,
          eventId: a.event.id,
          accountId: a.account.id,
          status: '生成中',
          risk: '普通',
        },
      })
      created.push({ id: task.id, key: i, account: a.account, event: a.event })
    }
    if (created.length === 0) return 0

    // 3. 批量生成候选
    const generated = await this.generateCandidates(created)
    for (const g of generated) {
      const task = created.find((t) => t.key === g.key)
      if (!task) continue
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          candidates: g.candidates,
          status: g.candidates.length ? '待选择' : '异常',
        },
      })
    }

    this.logger.log(`本次分配 ${created.length} 个账号任务`)
    return created.length
  }

  /** 查询任务列表（分页 + 服务端筛选） */
  async getTasks(query: TaskQueryDto) {
    const { page, pageSize, event, role, status, risk } = query
    const where: Prisma.TaskWhereInput = {}
    if (event) where.event = { title: event }
    if (role) where.account = { type: role }
    if (status) where.status = status
    if (risk) where.risk = risk

    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        include: { event: true, account: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: tasks.map((t) => this.toItem(t)),
      total,
      page,
      pageSize,
    }
  }

  /** 筛选下拉选项：去重的事件标题 / 状态 / 风险 */
  async getFacets() {
    const [eventIdRows, statusRows, riskRows] = await Promise.all([
      this.prisma.task.findMany({ distinct: ['eventId'], select: { eventId: true } }),
      this.prisma.task.findMany({ distinct: ['status'], select: { status: true } }),
      this.prisma.task.findMany({ distinct: ['risk'], select: { risk: true } }),
    ])

    const eventIds = eventIdRows.map((r) => r.eventId)
    const events = eventIds.length
      ? await this.prisma.event.findMany({
          where: { id: { in: eventIds } },
          select: { title: true },
        })
      : []

    return {
      events: [...new Set(events.map((e) => e.title))],
      statuses: [...new Set(statusRows.map((r) => r.status))],
      risks: [...new Set(riskRows.map((r) => r.risk))],
    }
  }

  private toItem(t: Task & { event: Event; account: Account }) {
    return {
      id: t.id,
      code: t.code,
      eventId: t.eventId,
      event: t.event.title,
      account: t.account.name,
      role: t.account.type,
      status: t.status,
      risk: t.risk,
      time: formatTime(t.createdAt),
      copies: (t.candidates as string[] | null) ?? [],
    }
  }

  private async findSnapshotEvents(snapshotId: string): Promise<Event[]> {
    const rows = await this.prisma.signal.findMany({
      where: { snapshotId, eventId: { not: null } },
      select: { eventId: true },
    })
    const ids = [...new Set(rows.map((r) => r.eventId!))]
    if (ids.length === 0) return []
    return this.prisma.event.findMany({ where: { id: { in: ids } } })
  }

  private async decideAssignments(
    events: Event[],
    accounts: Account[],
  ): Promise<Assignment[]> {
    const base = accounts.filter((a) => a.takesAllEvents)
    const persona = accounts.filter((a) => !a.takesAllEvents)

    // 基础层：承接所有事件
    const assignments: Assignment[] = []
    for (const event of events) {
      for (const account of base) {
        assignments.push({ event, account })
      }
    }

    // 人设层：LLM 判断参与
    if (persona.length > 0) {
      const decisions = await this.judgeParticipation(events, persona)
      for (const d of decisions) {
        if (d.participate) assignments.push({ event: d.event, account: d.account })
      }
    }

    return assignments
  }

  private async judgeParticipation(
    events: Event[],
    persona: Account[],
  ): Promise<Array<{ event: Event; account: Account; participate: boolean }>> {
    // 展平成 (event, account) 组合，用 key 索引
    const combos: Array<{ key: number; event: Event; account: Account }> = []
    const input: Array<{ key: number; eventTitle: string; eventSummary: string; accountName: string; persona: string }> = []
    for (const event of events) {
      for (const account of persona) {
        const key = combos.length
        combos.push({ key, event, account })
        input.push({
          key,
          eventTitle: event.title,
          eventSummary: event.summary,
          accountName: account.name,
          persona: account.persona ?? '',
        })
      }
    }

    try {
      const result = await this.llm.chatJson<{ decisions: Array<{ key: number; participate: boolean }> }>(
        [
          { role: 'system', content: PARTICIPATE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        { temperature: 0.2 },
      )
      return (result.decisions ?? []).map((d) => {
        const combo = combos.find((c) => c.key === d.key)
        return {
          event: combo!.event,
          account: combo!.account,
          participate: d.participate,
        }
      })
    } catch (error) {
      this.logger.error(`人设账号参与判断失败: ${(error as Error).message}`)
      return []
    }
  }

  private async generateCandidates(
    tasks: Array<{ key: number; account: Account; event: Event }>,
  ): Promise<Array<{ key: number; candidates: string[] }>> {
    const results: Array<{ key: number; candidates: string[] }> = []
    const CHUNK = 15

    for (let i = 0; i < tasks.length; i += CHUNK) {
      const chunk = tasks.slice(i, i + CHUNK)
      const input = chunk.map((t) => ({
        key: t.key,
        accountName: t.account.name,
        accountType: t.account.type,
        persona: t.account.persona ?? '',
        eventTitle: t.event.title,
        eventSummary: t.event.summary,
      }))

      try {
        const result = await this.llm.chatJson<{
          tasks: Array<{ key: number; candidates: string[] }>
        }>(
          [
            { role: 'system', content: GENERATE_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(input) },
          ],
          { temperature: 0.7 },
        )
        results.push(...(result.tasks ?? []))
      } catch (error) {
        this.logger.error(`候选内容生成失败: ${(error as Error).message}`)
      }
      this.logger.log(
        `候选生成进度 ${Math.min(i + CHUNK, tasks.length)}/${tasks.length}`,
      )
    }

    return results
  }

  /** 重新生成单个任务的候选（人工点击重试/调整） */
  async regenerateTask(taskId: string, instruction?: string): Promise<string[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { account: true, event: true },
    })
    if (!task) throw new Error('任务不存在')

    const candidates = await this.generateSingleCandidates(task, instruction)

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        candidates,
        status: candidates.length ? '待选择' : '异常',
      },
    })
    return candidates
  }

  /** 回填发布 URL，创建发布记录并启动追踪 */
  async publishTask(taskId: string, url: string, selectedCandidate?: number) {
    const trimmed = url.trim()
    if (!isValidXPostUrl(trimmed)) {
      throw new BadRequestException('URL 格式错误，请输入有效的 X 帖子链接')
    }

    const duplicate = await this.prisma.publishedPost.findUnique({
      where: { url: trimmed },
    })
    if (duplicate) {
      throw new BadRequestException('该 URL 已被其他任务使用')
    }

    const post = await this.prisma.publishedPost.create({
      data: {
        taskId,
        url: trimmed,
        publishedAt: new Date(),
        selectedCandidate: selectedCandidate ?? null,
        trackingStatus: '追踪中',
        trackingEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: '已完成' },
    })

    return post
  }

  private async generateSingleCandidates(
    task: { account: Account; event: Event },
    instruction?: string,
  ): Promise<string[]> {
    const result = await this.llm.chatJson<{ candidates: string[] }>(
      [
        { role: 'system', content: GENERATE_SINGLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            accountName: task.account.name,
            accountType: task.account.type,
            persona: task.account.persona ?? '',
            eventTitle: task.event.title,
            eventSummary: task.event.summary,
            instruction: instruction ?? '',
          }),
        },
      ],
      { temperature: 0.7 },
    )
    return result.candidates ?? []
  }
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function isValidXPostUrl(url: string): boolean {
  return /^https?:\/\/(x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(url)
}
