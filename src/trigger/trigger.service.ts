import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 对一次完整采集（snapshotId）做触发判断，命中后写回 Signal.trigger。
   * TR-01 前5 / TR-02 上升10位 / TR-04 跨区异动为确定性规则；
   * TR-03 重点主题为语义匹配，随批量 LLM 事件形成一并实现。
   */
  async evaluate(snapshotId: string): Promise<number> {
    const signals = await this.prisma.signal.findMany({
      where: { snapshotId, source: 'x-trending' },
    })
    if (signals.length === 0) return 0

    // 上一成功快照的排名（TR-02 用）
    const prevRankMap = await this.loadPreviousRankMap(snapshotId)

    const triggerMap = new Map<string, string[]>()
    const byName = new Map<string, { id: string; region: string }[]>()

    for (const s of signals) {
      const triggers: string[] = []

      // TR-01 前 5 触发
      if (s.rank != null && s.rank <= 5) triggers.push('TR-01')

      // TR-02 上升 10 位触发（上一快照排名 - 当前排名 >= 10）
      const prevRank = prevRankMap.get(s.sourceItemId)
      if (prevRank != null && s.rank != null && prevRank - s.rank >= 10) {
        triggers.push('TR-02')
      }

      if (triggers.length) triggerMap.set(s.id, triggers)

      // 收集同名条目（TR-04 跨区用）
      if (s.region != null) {
        const key = s.title.trim().toLowerCase()
        const list = byName.get(key) ?? []
        list.push({ id: s.id, region: s.region })
        byName.set(key, list)
      }
    }

    // TR-04 跨区异动：同名热搜同时出现在 ≥2 个地区
    for (const [, items] of byName) {
      if (new Set(items.map((i) => i.region)).size >= 2) {
        for (const item of items) {
          const arr = triggerMap.get(item.id) ?? []
          if (!arr.includes('TR-04')) arr.push('TR-04')
          triggerMap.set(item.id, arr)
        }
      }
    }

    // 写回 Signal.trigger
    let count = 0
    for (const [signalId, triggers] of triggerMap) {
      await this.prisma.signal.update({
        where: { id: signalId },
        data: { trigger: triggers.join('+') },
      })
      count++
    }

    if (count > 0) {
      this.logger.log(`快照 ${snapshotId} 命中 ${count} 条触发信号`)
    }
    return count
  }

  /** 取上一成功快照中各 sourceItemId 的排名 */
  private async loadPreviousRankMap(
    snapshotId: string,
  ): Promise<Map<string, number>> {
    const prev = await this.prisma.signal.findFirst({
      where: { source: 'x-trending', snapshotId: { not: snapshotId } },
      orderBy: { collectedAt: 'desc' },
      select: { snapshotId: true },
    })
    if (!prev?.snapshotId) return new Map()

    const rows = await this.prisma.signal.findMany({
      where: { source: 'x-trending', snapshotId: prev.snapshotId },
      select: { sourceItemId: true, rank: true },
    })

    const map = new Map<string, number>()
    for (const r of rows) {
      if (r.rank != null) map.set(r.sourceItemId, r.rank)
    }
    return map
  }
}
