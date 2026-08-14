import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LlmService } from '../llm/llm.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { TwitterService } from '../twitter/twitter.service'
import type { Tweet } from '../twitter/interfaces/twitter-trend.interface'
import type { Signal } from '@prisma/client'
import type {
  EventFormation,
  EventItem,
  RelationInput,
  RelationResult,
} from './event.types'

const MERGE_SIMILARITY_THRESHOLD = 0.9
const EVIDENCE_POSTS_PER_TITLE = 3
const EVIDENCE_CONCURRENCY = 5

const FORM_EVENT_SYSTEM_PROMPT = `你是热点事件整理助手。给定一批已触发的热搜信号（含地区、排名、触发原因和热门帖子），把它们归并成 Event。

规则：
1. 描述同一核心事实的信号（跨地区、不同表达、不同榜单）归并成同一个 Event。
2. 新动作/结果/状态/口径是独立 Event，不要归并。
3. 一句话摘要必须与证据确定程度一致：未确认信息用「多个热门帖子称」「X 上正在讨论」等限定表达；冲突时只描述有哪些说法，不把某一种写成唯一事实。
4. 核验结论三选一：信息一致 / 信息有限 / 存在冲突。
5. coreFact 是一句话核心事实，用于跨次去重。
6. signalTitles 列出归入本 Event 的信号标题（用输入里的原文标题）。

只输出 JSON：{"events":[{"coreFact":"...","title":"...","summary":"...","verify":"信息一致","regions":["Worldwide","US"],"trigger":"TR-01","signalTitles":["Botafogo"]}]}`

const RELATE_SYSTEM_PROMPT = `你是事件关联判断助手。给定每个新 Event 及其候选历史 Event（按语义相似度召回），判断哪些候选与当前 Event 属于同一具体发展线，并给出关系类型。

关系类型六选一：前置事件 / 后续进展 / 正式落地 / 结果公布 / 口径更正 / 事件反转。
只有明确属于同一发展线才输出关系；不确定就不输出。每个 Event 最多 3 条。

只输出 JSON：{"relations":[{"eventId":"...","relatedId":"...","relationType":"后续进展"}]}`

interface SignalInput {
  region: string
  title: string
  rank: number | null
  trigger: string
  posts: string[]
}

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly embedding: EmbeddingService,
    private readonly twitter: TwitterService,
  ) {}

  /** 对一次采集的触发信号做批量事件形成 */
  async formEvents(snapshotId: string): Promise<number> {
    const signals = await this.prisma.signal.findMany({
      where: { snapshotId, trigger: { not: null } },
    })
    if (signals.length === 0) return 0

    this.logger.log(`开始事件形成：${signals.length} 个触发信号`)

    // 1. 拉证据帖子（按 title 去重，每个 title 前 3 条）
    const tweetsMap = await this.fetchEvidence(signals)

    // 2. 批量 LLM 形成事件
    const inputs: SignalInput[] = signals.map((s) => ({
      region: s.region ?? '',
      title: s.title,
      rank: s.rank,
      trigger: s.trigger ?? '',
      posts: (tweetsMap.get(s.title) ?? []).map((t) => t.text).filter(Boolean),
    }))
    const formations = await this.batchForm(inputs)

    // 3. 逐个落库（embedding 去重归并）
    let count = 0
    for (const f of formations) {
      const ok = await this.upsertEvent(f, signals, tweetsMap)
      if (ok) count++
    }

    if (count > 0) this.logger.log(`本次形成 ${count} 个 Event`)
    return count
  }

  /** 拉取每个唯一热搜词的前 3 条热门帖子 */
  private async fetchEvidence(signals: Signal[]): Promise<Map<string, Tweet[]>> {
    const titles = [...new Set(signals.map((s) => s.title))]
    const map = new Map<string, Tweet[]>()
    const queue = [...titles]
    this.logger.log(`开始拉取 ${titles.length} 个热搜词的证据帖子`)

    const workers = Array.from({ length: EVIDENCE_CONCURRENCY }, async () => {
      while (queue.length) {
        const title = queue.shift()!
        try {
          const tweets = await this.twitter.getTopPosts(title, EVIDENCE_POSTS_PER_TITLE)
          map.set(title, tweets)
        } catch (error) {
          this.logger.warn(`拉取「${title}」帖子失败: ${(error as Error).message}`)
          map.set(title, [])
        }
      }
    })
    await Promise.all(workers)
    this.logger.log(`证据帖子拉取完成`)
    return map
  }

  /** 批量调用大模型形成事件 */
  private async batchForm(inputs: SignalInput[]): Promise<EventFormation[]> {
    try {
      const result = await this.llm.chatJson<{ events: EventFormation[] }>(
        [
          { role: 'system', content: FORM_EVENT_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(inputs) },
        ],
        { temperature: 0.2 },
      )
      return result.events ?? []
    } catch (error) {
      this.logger.error(`批量事件形成失败: ${(error as Error).message}`)
      return []
    }
  }

  /** embedding 去重后新建或归并 Event */
  private async upsertEvent(
    f: EventFormation,
    signals: Signal[],
    tweetsMap: Map<string, Tweet[]>,
  ): Promise<boolean> {
    try {
      const [vector] = await this.embedding.embed([f.coreFact])

      const similar = await this.findSimilarEvent(vector)
      if (similar) {
        await this.mergeEvent(similar.id, f)
        return true
      }

      const event = await this.prisma.event.create({
        data: {
          title: f.title,
          summary: f.summary,
          coreFact: f.coreFact,
          verify: f.verify,
          status: '内容生成中',
          regions: f.regions,
          trigger: f.trigger,
          firstDiscoveredAt: new Date(),
        },
      })

      await this.setEmbedding(event.id, vector)

      // 存事实依据（帖子 URL）
      const titleRegion = new Map(signals.map((s) => [s.title, s.region ?? '']))
      const evidenceData: Array<{
        eventId: string
        region: string | null
        url: string
        order: number
      }> = []
      for (const title of [...new Set(f.signalTitles)]) {
        const tweets = tweetsMap.get(title) ?? []
        tweets.forEach((t, i) => {
          evidenceData.push({
            eventId: event.id,
            region: titleRegion.get(title) ?? null,
            url: t.url,
            order: i,
          })
        })
      }
      if (evidenceData.length) {
        await this.prisma.evidence.createMany({ data: evidenceData })
      }

      // 关联归入本 Event 的信号
      const matchedIds = signals
        .filter((s) => f.signalTitles.includes(s.title))
        .map((s) => s.id)
      if (matchedIds.length) {
        await this.prisma.signal.updateMany({
          where: { id: { in: matchedIds } },
          data: { eventId: event.id },
        })
      }

      this.logger.log(`新建 Event: ${f.title}`)
      return true
    } catch (error) {
      this.logger.error(`Event 落库失败「${f.title}」: ${(error as Error).message}`)
      return false
    }
  }

  /** 向量相似度召回最相近的已有 Event */
  private async findSimilarEvent(vector: number[]): Promise<{ id: string } | null> {
    const vecStr = toVectorLiteral(vector)
    const rows = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
      SELECT id, 1 - ("coreFactEmbedding" <=> ${vecStr}::vector) AS similarity
      FROM "Event"
      WHERE "coreFactEmbedding" IS NOT NULL
      ORDER BY "coreFactEmbedding" <=> ${vecStr}::vector
      LIMIT 1
    `
    const top = rows[0]
    return top && Number(top.similarity) >= MERGE_SIMILARITY_THRESHOLD
      ? { id: top.id }
      : null
  }

  /** 归并到已有 Event（更新地区、摘要等，不新建） */
  private async mergeEvent(eventId: string, f: EventFormation): Promise<void> {
    const existing = await this.prisma.event.findUnique({ where: { id: eventId } })
    if (!existing) return

    const mergedRegions = [
      ...new Set([...(existing.regions as string[]), ...f.regions]),
    ]
    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        summary: f.summary,
        verify: f.verify,
        regions: mergedRegions,
        trigger: f.trigger,
      },
    })
    this.logger.log(`归并 Event: ${f.title} → ${existing.title}`)
  }

  /** 写入 coreFact 向量（Prisma 不支持 vector，走原生 SQL） */
  private async setEmbedding(eventId: string, vector: number[]): Promise<void> {
    const vecStr = toVectorLiteral(vector)
    await this.prisma.$executeRaw`
      UPDATE "Event" SET "coreFactEmbedding" = ${vecStr}::vector WHERE id = ${eventId}
    `
  }

  /** 关联召回：对本次快照形成的 Event，召回历史候选并让 LLM 判断关系（SPEC 8.4） */
  async relateEvents(snapshotId: string): Promise<number> {
    const eventIds = await this.findSnapshotEventIds(snapshotId)
    if (eventIds.length === 0) return 0

    // 1. 每个 Event 向量召回候选
    const inputs: RelationInput[] = []
    for (const id of eventIds) {
      const event = await this.prisma.event.findUnique({ where: { id } })
      if (!event) continue
      try {
        const [vector] = await this.embedding.embed([event.coreFact])
        const candidates = await this.recallCandidates(id, vector, 5)
        if (candidates.length > 0) {
          inputs.push({
            eventId: event.id,
            title: event.title,
            summary: event.summary,
            candidates,
          })
        }
      } catch (error) {
        this.logger.warn(`召回候选失败「${event.title}」: ${(error as Error).message}`)
      }
    }
    if (inputs.length === 0) return 0

    // 2. 批量 LLM 判断关系
    const relations = await this.judgeRelations(inputs)

    // 3. 校验并写 EventRelation（去重）
    const valid = relations.filter((r) => {
      const input = inputs.find((i) => i.eventId === r.eventId)
      return input && input.candidates.some((c) => c.id === r.relatedId)
    })
    if (valid.length === 0) return 0

    const result = await this.prisma.eventRelation.createMany({
      data: valid.map((r) => ({
        fromEventId: r.eventId,
        toEventId: r.relatedId,
        relationType: r.relationType,
      })),
      skipDuplicates: true,
    })

    if (result.count > 0) this.logger.log(`建立 ${result.count} 条 Event 关联`)
    return result.count
  }

  private async findSnapshotEventIds(snapshotId: string): Promise<string[]> {
    const rows = await this.prisma.signal.findMany({
      where: { snapshotId, eventId: { not: null } },
      select: { eventId: true },
    })
    return [...new Set(rows.map((r) => r.eventId!))]
  }

  private async recallCandidates(
    eventId: string,
    vector: number[],
    limit = 5,
  ): Promise<Array<{ id: string; title: string; summary: string }>> {
    const vecStr = toVectorLiteral(vector)
    return this.prisma.$queryRaw<
      Array<{ id: string; title: string; summary: string }>
    >`
      SELECT id, title, summary
      FROM "Event"
      WHERE "coreFactEmbedding" IS NOT NULL AND id != ${eventId}
      ORDER BY "coreFactEmbedding" <=> ${vecStr}::vector
      LIMIT ${limit}
    `
  }

  private async judgeRelations(
    inputs: RelationInput[],
  ): Promise<RelationResult[]> {
    try {
      const result = await this.llm.chatJson<{ relations: RelationResult[] }>(
        [
          { role: 'system', content: RELATE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(inputs) },
        ],
        { temperature: 0.2 },
      )
      return result.relations ?? []
    } catch (error) {
      this.logger.error(`关联召回 LLM 失败: ${(error as Error).message}`)
      return []
    }
  }

  /** 查询所有 Event，映射为前端 EventItem 结构 */
  async getEvents(): Promise<EventItem[]> {
    const events = await this.prisma.event.findMany({
      include: {
        evidence: { orderBy: { order: 'asc' } },
        outgoingRelations: { include: { to: true } },
      },
      orderBy: { firstDiscoveredAt: 'desc' },
    })

    return events.map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      status: e.status,
      verify: e.verify,
      regions: (e.regions as string[]).join(' / '),
      trigger: e.trigger,
      urls: e.evidence.map((ev) => ev.url),
      related: e.outgoingRelations.map(
        (r) => `${r.relationType} · ${r.to.title}`,
      ),
    }))
  }
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
