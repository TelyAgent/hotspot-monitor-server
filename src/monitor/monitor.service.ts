import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { EventService } from '../event/event.service'
import { SignalService } from '../signal/signal.service'
import type { RawSignal } from '../signal/signal.types'
import { TaskService } from '../task/task.service'
import { TriggerService } from '../trigger/trigger.service'
import { TwitterService } from '../twitter/twitter.service'
import { TrendingQueryDto } from './dto/trending-query.dto'
import type { TrendingResponse } from './interfaces/trending.interface'

const REGIONS = [
  'Worldwide',
  'United States',
  'United Kingdom',
  'Japan',
  'Korea',
] as const

// 前端地区 → Twitter WOEID（Where On Earth ID）
const REGION_WOEID: Record<string, number> = {
  Worldwide: 1,
  'United States': 23424977,
  'United Kingdom': 23424975,
  Japan: 23424856,
  Korea: 23424868,
}

@Injectable()
export class MonitorService implements OnModuleInit {
  private readonly logger = new Logger(MonitorService.name)

  constructor(
    private readonly twitterService: TwitterService,
    private readonly prisma: PrismaService,
    private readonly signalService: SignalService,
    private readonly triggerService: TriggerService,
    private readonly eventService: EventService,
    private readonly taskService: TaskService,
  ) {}

  // 服务启动时先采集一次，避免数据库为空
  onModuleInit() {
    void this.collectTrends()
  }

  // 每小时整点自动刷新一次
  @Cron(CronExpression.EVERY_HOUR)
  async collectTrendsScheduled() {
    await this.collectTrends()
  }

  /** 拉取各地区的真实热搜并写入数据库（只存真实数据，跳过模拟回退） */
  async collectTrends(): Promise<void> {
    // 一次完整采集共享一个快照 ID，用于信号去重和后续跨区归并
    const snapshotId = `snap_${Date.now()}`

    await Promise.all(
      REGIONS.map(async (region) => {
        const woeid = REGION_WOEID[region] ?? 1
        try {
          const { trends, source } = await this.twitterService.getTrends(woeid, 30)
          if (source !== 'twitter') {
            this.logger.warn(`地区 ${region} 采集失败（回退模拟数据），跳过写入数据库`)
            return
          }

          const collectedAt = new Date()

          // 榜单快照（热搜排行榜展示）
          await this.prisma.trendingRecord.createMany({
            data: trends.map((t, i) => ({
              region,
              rank: i + 1,
              name: t.name,
              query: t.query,
              url: t.url,
              collectedAt,
            })),
          })

          // 原始信号（事件形成流水线）
          const signals: RawSignal[] = trends.map((t, i) => ({
            source: 'x-trending',
            sourceItemId: `${region}:${t.name}`,
            region,
            title: t.name,
            url: t.url,
            rank: i + 1,
            snapshotId,
            collectedAt,
            extra: { query: t.query },
          }))
          const ingested = await this.signalService.ingest(signals)

          this.logger.log(
            `地区 ${region} 已采集 ${trends.length} 条热搜（信号 ${ingested} 条）并写入数据库`,
          )
        } catch (error) {
          this.logger.error(`地区 ${region} 采集异常: ${(error as Error).message}`)
        }
      }),
    )

    // 5 个地区快照都到齐后，聚合触发判断一次
    const triggered = await this.triggerService.evaluate(snapshotId)
    if (triggered > 0) {
      this.logger.log(`本次采集命中 ${triggered} 条触发信号`)
      // 事件形成 → 关联 → 任务分配 → 候选生成：异步后台执行，不阻塞采集返回
      void this.runEventPipeline(snapshotId)
    }
  }

  /** 事件流水线：形成/关联/分配/生成，异步后台执行（避免阻塞采集接口） */
  private async runEventPipeline(snapshotId: string): Promise<void> {
    try {
      await this.eventService.formEvents(snapshotId)
      await this.eventService.relateEvents(snapshotId)
      await this.taskService.assignAndGenerate(snapshotId)
      this.logger.log(`事件流水线完成（快照 ${snapshotId}）`)
    } catch (error) {
      this.logger.error(
        `事件流水线失败（快照 ${snapshotId}）: ${(error as Error).message}`,
      )
    }
  }

  /** 前端查询：直接读数据库里该地区最近一次快照 */
  async getTrending(query: TrendingQueryDto): Promise<TrendingResponse> {
    const { region, limit } = query

    const latest = await this.prisma.trendingRecord.findFirst({
      where: { region },
      orderBy: { collectedAt: 'desc' },
      select: { collectedAt: true },
    })

    if (!latest) {
      return {
        region,
        collectedAt: new Date().toISOString(),
        source: 'twitter',
        items: [],
      }
    }

    const records = await this.prisma.trendingRecord.findMany({
      where: { region, collectedAt: latest.collectedAt },
      orderBy: { rank: 'asc' },
      take: limit,
    })

    return {
      region,
      collectedAt: latest.collectedAt.toISOString(),
      source: 'twitter',
      items: records.map((r) => ({
        rank: r.rank,
        name: r.name,
        query: r.query,
        url: r.url,
        heat: '—',
      })),
    }
  }

  /** 手动刷新（对应「立即采集」按钮） */
  async refresh() {
    await this.collectTrends()
    return { status: 'ok', message: '已重新采集各地区的热搜，事件处理在后台进行' }
  }
}
