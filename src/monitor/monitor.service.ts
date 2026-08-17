import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
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

// 热搜第三方接口调用节流：距上次成功采集不足 2 小时不重复调用，控制 API 费用
const TREND_REFRESH_MS = 2 * 60 * 60 * 1000

// 每个地区只保留最近 N 份榜单快照，避免 TrendingRecord 无限膨胀
const MAX_TREND_SNAPSHOTS = 5

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

  // 每 2 小时整点自动刷新一次（配合 collectTrends 内部节流，避免无端调用第三方 API）
  @Cron('0 */2 * * *')
  async collectTrendsScheduled() {
    await this.collectTrends()
  }

  /** 拉取各地区的真实热搜并写入数据库（只存真实数据，跳过模拟回退） */
  async collectTrends(force = false): Promise<void> {
    // 一次完整采集共享一个快照 ID，用于信号去重和后续跨区归并
    const snapshotId = `snap_${Date.now()}`
    let fetched = 0

    await Promise.all(
      REGIONS.map(async (region) => {
        // 2 小时节流：查采集行为记录里该地区最近一次调用时间，不足 2 小时跳过
        if (!force) {
          const last = await this.prisma.trendFetchLog.findFirst({
            where: { region },
            orderBy: { fetchedAt: 'desc' },
            select: { fetchedAt: true },
          })
          if (last && Date.now() - last.fetchedAt.getTime() < TREND_REFRESH_MS) {
            this.logger.log(`地区 ${region} 距上次采集不足 2 小时，跳过（节流）`)
            return
          }
        }

        const woeid = REGION_WOEID[region] ?? 1
        try {
          const { trends, source } = await this.twitterService.getTrends(woeid, 30)

          // 记录本次采集行为（真实调用或回退 mock 都记一行，作为节流与费用基线）
          await this.prisma.trendFetchLog.create({
            data: { region, source, count: trends.length },
          })

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

          // 只保留最近 N 份快照，删除更早的历史快照
          await this.pruneOldSnapshots(region)

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
          fetched++

          this.logger.log(
            `地区 ${region} 已采集 ${trends.length} 条热搜（信号 ${ingested} 条）并写入数据库`,
          )
        } catch (error) {
          this.logger.error(`地区 ${region} 采集异常: ${(error as Error).message}`)
        }
      }),
    )

    // 触发判断 + 事件流水线：有新增采集才执行，全部被节流则跳过
    if (fetched > 0) {
      void this.runPipeline(snapshotId)
    }
  }

  /** 每个地区只保留最近 MAX_TREND_SNAPSHOTS 份榜单快照 */
  private async pruneOldSnapshots(region: string): Promise<void> {
    const recent = await this.prisma.trendingRecord.findMany({
      where: { region },
      distinct: ['collectedAt'],
      orderBy: { collectedAt: 'desc' },
      take: MAX_TREND_SNAPSHOTS,
      select: { collectedAt: true },
    })
    if (recent.length >= MAX_TREND_SNAPSHOTS) {
      await this.prisma.trendingRecord.deleteMany({
        where: { region, collectedAt: { lt: recent[recent.length - 1].collectedAt } },
      })
    }
  }

  /** 触发判断 + 事件流水线：形成/关联/分配/生成，异步后台执行 */
  private async runPipeline(snapshotId: string): Promise<void> {
    try {
      const triggered = await this.triggerService.evaluate(snapshotId)
      if (triggered === 0) return
      this.logger.log(`本次采集命中 ${triggered} 条触发信号`)

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

  /** 手动刷新（对应「立即采集」按钮）：强制采集，绕过 2 小时节流 */
  async refresh() {
    await this.collectTrends(true)
    return { status: 'ok', message: '已重新采集各地区的热搜，事件处理在后台进行' }
  }
}
