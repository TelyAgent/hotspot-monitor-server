import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LlmService } from '../llm/llm.service'
import type { Signal } from '@prisma/client'

const CROSS_REGION_PROMPT = `你是跨区异动判断助手。给定一批热搜信号（含标题和地区），把描述同一具体事件的信号分组。
同一事件可能在不同地区用不同标题或语言表达，但核心事实相同就算同一组；不相关的事件不要分到一组。
每个信号只属于一个组。

只输出 JSON：{"groups":[[0,1],[2]]}，数组里的数字是输入里信号的 key。`

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /**
   * 对一次完整采集（snapshotId）做触发判断，命中后写回 Signal.trigger。
   * TR-01 前5 / TR-02 上升10位 / TR-04 跨区异动；
   * TR-03 重点主题为语义匹配，随批量 LLM 事件形成一并实现。
   */
  async evaluate(snapshotId: string): Promise<number> {
    const signals = await this.prisma.signal.findMany({
      where: { snapshotId, source: 'x-trending' },
    })
    if (signals.length === 0) return 0

    const prevRankMap = await this.loadPreviousRankMap(snapshotId)

    const triggerMap = new Map<string, string[]>()

    for (const s of signals) {
      const triggers: string[] = []
      const prevRank = prevRankMap.get(s.sourceItemId)

      // TR-01 首次进入前 5（当前前5 且 上一快照无排名 或 上一快照排名 > 5）
      if (s.rank != null && s.rank <= 5 && (prevRank == null || prevRank > 5)) {
        triggers.push('TR-01')
      }

      // TR-02 上升 10 位（上一快照排名 - 当前排名 >= 10）
      if (prevRank != null && s.rank != null && prevRank - s.rank >= 10) {
        triggers.push('TR-02')
      }

      if (triggers.length) triggerMap.set(s.id, triggers)
    }

    // TR-04 跨区异动（同名匹配 + LLM 语义分组补「同事件不同标题」）
    const crossRegionIds = await this.detectCrossRegion(signals)
    for (const id of crossRegionIds) {
      const arr = triggerMap.get(id) ?? []
      if (!arr.includes('TR-04')) arr.push('TR-04')
      triggerMap.set(id, arr)
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

  /** TR-04：同名匹配做兜底，LLM 语义分组补「同事件不同标题」的跨区 */
  private async detectCrossRegion(signals: Signal[]): Promise<Set<string>> {
    const withRegion = signals.filter((s) => s.region != null)
    if (withRegion.length < 2) return new Set()

    const crossRegionIds = new Set<string>()

    // 1. 同名匹配（快速、可靠）
    const byName = new Map<string, string[]>()
    for (const s of withRegion) {
      const key = s.title.trim().toLowerCase()
      const list = byName.get(key) ?? []
      list.push(s.id)
      byName.set(key, list)
    }
    for (const ids of byName.values()) {
      const regions = new Set(ids.map((id) => withRegion.find((s) => s.id === id)?.region))
      if (regions.size >= 2) {
        ids.forEach((id) => crossRegionIds.add(id))
      }
    }

    // 2. LLM 语义分组（补上「同事件不同标题/语言」的跨区）
    try {
      const input = withRegion.map((s, i) => ({ key: i, title: s.title, region: s.region }))
      const result = await this.llm.chatJson<{ groups: number[][] }>(
        [
          { role: 'system', content: CROSS_REGION_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        { temperature: 0.1 },
      )

      for (const group of result.groups ?? []) {
        const regions = new Set(
          group.map((i) => withRegion[i]?.region).filter((r): r is string => !!r),
        )
        if (regions.size >= 2) {
          group.forEach((i) => {
            if (withRegion[i]) crossRegionIds.add(withRegion[i].id)
          })
        }
      }
    } catch (error) {
      this.logger.warn(`TR-04 LLM 分组失败，仅用同名匹配: ${(error as Error).message}`)
    }

    return crossRegionIds
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
