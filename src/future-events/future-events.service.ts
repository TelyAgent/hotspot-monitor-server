import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SEED_FUTURE_EVENTS, SEED_SOURCE_STATUS } from './future-events.seed'

export interface FutureEventQuery {
  month?: string
  unassigned?: boolean
}

export interface CreateFutureEventPayload {
  title: string
  subject?: string
  eventType?: string
  factTime?: string | null
  timezone?: string
  schedulePrecision?: string
  sourceUrl: string
  attentionReason?: string
}

function emptyHeat(query: string) {
  return {
    query,
    queryVersion: 'v1',
    monitoringStartedAt: null,
    buckets: [],
    last6h: 0,
    prev6h: 0,
    growthPct: null,
    intensityMultiple: null,
    cumulative: 0,
  }
}

@Injectable()
export class FutureEventsService implements OnModuleInit {
  private readonly logger = new Logger(FutureEventsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedIfEmpty()
  }

  /** 列表：按月（YYYY-MM）或未排期（unassigned）筛选 */
  async getFutureEvents(query: FutureEventQuery) {
    const where: Prisma.FutureEventWhereInput = {}
    if (query.unassigned) {
      where.factTime = null
    } else if (query.month) {
      const [year, month] = query.month.split('-').map(Number)
      where.factTime = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      }
    }
    return this.prisma.futureEvent.findMany({
      where,
      orderBy: { factTime: 'asc' },
    })
  }

  async getFutureEvent(id: string) {
    const e = await this.prisma.futureEvent.findUnique({ where: { id } })
    if (!e) throw new NotFoundException(`未来事件不存在：${id}`)
    return e
  }

  async getFutureEventHeat(id: string) {
    const e = await this.getFutureEvent(id)
    return e.heat
  }

  async getSourceSyncStatus() {
    return this.prisma.futureSourceStatus.findMany({ orderBy: { source: 'asc' } })
  }

  async createFutureEvent(data: CreateFutureEventPayload) {
    const now = new Date()
    return this.prisma.futureEvent.create({
      data: {
        title: data.title,
        subject: data.subject ?? '',
        eventType: data.eventType ?? '人工导入',
        factTime: data.factTime ? new Date(data.factTime) : null,
        timezone: data.timezone ?? 'UTC',
        schedulePrecision: data.schedulePrecision ?? (data.factTime ? 'date' : 'unknown'),
        confirmationLevel: 'needs_verification',
        expressionBoundary: 'internal_only',
        actionScore: {
          total: 0,
          impact: { scope: 0, relevance: 0, outcomeImportance: 0 },
          evidence: 0,
          heatMomentum: 0,
          timeUrgency: 0,
          contentReadiness: 0,
          version: 'v1',
        },
        evidence: [
          {
            id: `ev-${now.getTime()}`,
            url: data.sourceUrl,
            sourceType: 'manual',
            verifiedAt: now.toISOString(),
            claims: data.attentionReason ? [data.attentionReason] : [],
          },
        ],
        windows: { monitoring: null, preheat: null, live: null, followUp: null },
        heat: emptyHeat(''),
        ruleVersion: 'v1',
      },
    })
  }

  async updateFutureEvent(id: string, data: Partial<CreateFutureEventPayload>) {
    await this.getFutureEvent(id)
    const patch: Prisma.FutureEventUpdateInput = {}
    if (data.title !== undefined) patch.title = data.title
    if (data.subject !== undefined) patch.subject = data.subject
    if (data.eventType !== undefined) patch.eventType = data.eventType
    if (data.timezone !== undefined) patch.timezone = data.timezone
    if (data.schedulePrecision !== undefined) patch.schedulePrecision = data.schedulePrecision
    if (data.factTime !== undefined) {
      patch.factTime = data.factTime ? new Date(data.factTime) : null
    }
    return this.prisma.futureEvent.update({ where: { id }, data: patch })
  }

  async deleteFutureEvent(id: string) {
    await this.getFutureEvent(id)
    await this.prisma.futureEvent.delete({ where: { id } })
    return { status: 'deleted' }
  }

  async resyncSource(source: string) {
    await this.prisma.futureSourceStatus.update({
      where: { source },
      data: { status: 'pending', message: '已触发重新同步' },
    })
    return { status: 'triggered' }
  }

  async importFutureEvents(csv: string) {
    const lines = csv
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    let imported = 0
    let skipped = 0
    const events: unknown[] = []
    for (const line of lines.slice(1)) {
      const [title, subject, eventType, factTime, sourceUrl] = line.split(',').map((c) => c.trim())
      if (!title || !sourceUrl) {
        skipped++
        continue
      }
      const e = await this.createFutureEvent({
        title,
        subject,
        eventType,
        factTime: factTime || null,
        sourceUrl,
      })
      events.push(e)
      imported++
    }
    return { imported, skipped, events }
  }

  async respondFutureEvent(id: string, kind: string) {
    const fe = await this.getFutureEvent(id)
    // 简化：创建排期人工响应 Event（后续可复用同核心事实的既有 Event）
    const event = await this.prisma.event.create({
      data: {
        title: fe.title,
        summary: fe.subject || fe.title,
        coreFact: fe.title,
        verify: '未核验',
        status: '排期人工响应',
        regions: [],
        trigger: 'scheduled_manual_response',
        firstDiscoveredAt: new Date(),
      },
    })
    return { eventId: event.id, next: kind }
  }

  private async seedIfEmpty() {
    if ((await this.prisma.futureEvent.count()) === 0) {
      await this.prisma.futureEvent.createMany({
        data: SEED_FUTURE_EVENTS as Prisma.FutureEventCreateManyInput[],
      })
      this.logger.log(`未来事件已初始化：${SEED_FUTURE_EVENTS.length} 条`)
    }
    if ((await this.prisma.futureSourceStatus.count()) === 0) {
      await this.prisma.futureSourceStatus.createMany({
        data: SEED_SOURCE_STATUS as Prisma.FutureSourceStatusCreateManyInput[],
      })
      this.logger.log('来源同步状态已初始化')
    }
  }
}
