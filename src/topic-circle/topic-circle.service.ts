import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { TwitterService } from '../twitter/twitter.service'
import { LlmService } from '../llm/llm.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { TaskService } from '../task/task.service'

// 10 分钟重叠：防接口延迟和边界遗漏，靠帖子 ID 去重
const OVERLAP_MS = 10 * 60 * 1000
// 首次采集回填最近 3 小时，之后按上次成功时间递增
const FIRST_COLLECT_WINDOW_MS = 3 * 60 * 60 * 1000
// 话题总结窗口：对最近 3 小时的帖子做聚类
const SUMMARIZE_WINDOW_MS = 3 * 60 * 60 * 1000
// 单个账号单次最多翻几页，防止失控
const MAX_PAGES = 5
// 主题圈话题合并阈值（同一事件识别）
const TOPIC_MERGE_THRESHOLD = 0.95
// 跨路径去重阈值（主题圈 Event 与热搜 Event 同核心事实时复用）
const CROSS_PATH_MERGE_THRESHOLD = 0.9

const SUMMARIZE_SYSTEM_PROMPT = `你是主题圈话题总结助手。给定某个主题圈最近 3 小时内监控账号发布的帖子，把指向同一具体事件/话题的帖子归并，总结成话题。

规则：
1. 同一话题要求主体、动作、对象、时间、地点、事件状态都指向同一具体事件；仅关键词相似、同一人物、相同立场不算同一话题，不要强行合并。
2. 纯转发、广告、灌水、与主题圈无关、无法识别具体事件的帖子不归入任何话题（忽略即可）。
3. 每个话题输出：title（简短标题）、summary（一句话说明，与证据确定程度一致，不确定用「据报道」「多个帖子称」等限定表达）、coreFact（一句话核心事实，用于去重）、postIds（归入该话题的帖子 ID 列表）。
4. 不确定就分开，宁多勿错。

只输出 JSON：{"topics":[{"title":"...","summary":"...","coreFact":"...","postIds":["..."]}]}`

interface SummarizedTopic {
  title: string
  summary: string
  coreFact: string
  postIds: string[]
}

@Injectable()
export class TopicCircleService {
  private readonly logger = new Logger(TopicCircleService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterService,
    private readonly llm: LlmService,
    private readonly embedding: EmbeddingService,
    private readonly taskService: TaskService,
  ) {}

  // 每 3 小时整点：采集 + 总结话题 + 计算关注度 + 触发判断
  @Cron('0 */3 * * *')
  async collectScheduled() {
    await this.collectAll()
    await this.summarizeTopics()
    await this.computeMetrics()
    await this.evaluateTriggers()
  }

  /** 采集全部启用主题圈的账号新帖子 */
  async collectAll() {
    const topics = await this.prisma.topic.findMany({ where: { enabled: true } })

    let accountCount = 0
    let totalCollected = 0

    for (const topic of topics) {
      const handles = (topic.accounts ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      for (const raw of handles) {
        accountCount++
        try {
          totalCollected += await this.collectAccount(raw, topic.name)
        } catch (error) {
          this.logger.warn(`账号 ${raw} 采集失败: ${(error as Error).message}`)
        }
      }
    }

    this.logger.log(`主题圈采集完成：${accountCount} 个账号，新增 ${totalCollected} 条帖子`)
    return { accounts: accountCount, collected: totalCollected }
  }

  /** 把最近 3 小时的帖子按主题圈用 LLM 总结成话题 */
  async summarizeTopics() {
    const circles = await this.prisma.topic.findMany({ where: { enabled: true } })
    const since = new Date(Date.now() - SUMMARIZE_WINDOW_MS)

    let total = 0

    for (const topic of circles) {
      const posts = await this.prisma.topicCirclePost.findMany({
        where: { circle: topic.name, postedAt: { gte: since } },
        orderBy: { postedAt: 'asc' },
      })
      if (posts.length === 0) continue

      const input = posts.map((p) => ({
        id: p.postId,
        handle: p.handle,
        text: p.text,
        postedAt: p.postedAt.toISOString(),
      }))

      let topics: SummarizedTopic[] = []
      try {
        const result = await this.llm.chatJson<{ topics: SummarizedTopic[] }>(
          [
            { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({ circle: topic.name, posts: input }),
            },
          ],
          { temperature: 0.2 },
        )
        topics = result.topics ?? []
      } catch (error) {
        this.logger.error(`主题圈「${topic.name}」话题总结失败: ${(error as Error).message}`)
        continue
      }

      for (const t of topics) {
        // 0.95 向量合并：同圈已有相似话题则累积帖子，否则新建
        const similarId = await this.findSimilarTopicId(topic.name, t.coreFact)
        if (similarId) {
          const similar = await this.prisma.topicCircleTopic.findUnique({
            where: { id: similarId },
          })
          if (similar) {
            const merged = [
              ...new Set([...(similar.postIds as string[]), ...t.postIds]),
            ]
            await this.prisma.topicCircleTopic.update({
              where: { id: similarId },
              data: { postIds: merged, title: t.title, summary: t.summary },
            })
          }
          continue
        }

        const created = await this.prisma.topicCircleTopic.create({
          data: {
            circle: topic.name,
            title: t.title,
            summary: t.summary,
            coreFact: t.coreFact,
            postIds: t.postIds,
          },
        })

        try {
          const [vector] = await this.embedding.embed([t.coreFact])
          await this.setTopicEmbedding(created.id, vector)
        } catch (error) {
          this.logger.warn(`话题向量写入失败: ${(error as Error).message}`)
        }

        total++
      }
    }

    this.logger.log(`话题总结完成：新增 ${total} 个话题`)
    return { topics: total }
  }

  /** 对最近 24h 内更新的话题计算 B3h / B24h / Tmax */
  async computeMetrics() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const since3h = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const topics = await this.prisma.topicCircleTopic.findMany({
      where: { updatedAt: { gte: since24h } },
    })

    let computed = 0
    for (const topic of topics) {
      const postIds = topic.postIds as string[]
      if (!postIds.length) continue

      const posts = await this.prisma.topicCirclePost.findMany({
        where: { postId: { in: postIds } },
        select: { handle: true, postedAt: true, viewCount: true },
      })

      const b3h = new Set(
        posts.filter((p) => p.postedAt >= since3h).map((p) => p.handle),
      ).size
      const b24h = new Set(
        posts.filter((p) => p.postedAt >= since24h).map((p) => p.handle),
      ).size
      const strongest = await this.computeTmax(posts)
      const tmax = strongest?.ratio ?? null
      const tmaxTop5 = strongest
        ? await this.isTop5Percent(strongest.handle, strongest.viewCount)
        : false

      await this.prisma.topicCircleTopic.update({
        where: { id: topic.id },
        data: { b3h, b24h, tmax, tmaxTop5 },
      })
      computed++
    }

    this.logger.log(`关注度计算完成：${computed} 个话题`)
    return { computed }
  }

  /** 简化版 Tmax：话题内帖子「浏览量 ÷ 该账号近期帖子浏览中位数」的最大值，返回最强帖子 */
  private async computeTmax(
    posts: Array<{ handle: string; viewCount: number | null }>,
  ): Promise<{ ratio: number; handle: string; viewCount: number } | null> {
    const baselines = new Map<string, number>()
    for (const handle of [...new Set(posts.map((p) => p.handle))]) {
      const baseline = await this.accountBaseline(handle)
      if (baseline) baselines.set(handle, baseline)
    }

    let best: { ratio: number; handle: string; viewCount: number } | null = null
    for (const p of posts) {
      const baseline = baselines.get(p.handle)
      if (!baseline || !p.viewCount) continue
      const ratio = p.viewCount / baseline
      if (best === null || ratio > best.ratio) {
        best = { ratio, handle: p.handle, viewCount: p.viewCount }
      }
    }
    return best
  }

  /** 最强帖是否进入该账号近期帖子浏览量的前 5% */
  private async isTop5Percent(handle: string, viewCount: number): Promise<boolean> {
    const posts = await this.prisma.topicCirclePost.findMany({
      where: { handle, viewCount: { not: null } },
      orderBy: { viewCount: 'desc' },
      take: 30,
      select: { viewCount: true },
    })
    if (posts.length < 20) return false
    const k = Math.max(1, Math.round(posts.length * 0.05))
    const threshold = posts[k - 1]?.viewCount
    return threshold != null && viewCount >= threshold
  }

  /** 账号近期最多 30 条有浏览量的帖子的浏览中位数（初始基线） */
  private async accountBaseline(handle: string): Promise<number | null> {
    const posts = await this.prisma.topicCirclePost.findMany({
      where: { handle, viewCount: { not: null } },
      orderBy: { postedAt: 'desc' },
      take: 30,
      select: { viewCount: true },
    })
    const views = posts.map((p) => p.viewCount!).sort((a, b) => a - b)
    if (views.length === 0) return null
    const mid = Math.floor(views.length / 2)
    return views.length % 2 ? views[mid] : (views[mid - 1] + views[mid]) / 2
  }

  /** 触发判断：首次命中 → 建/复用 Event + 启动响应；已触发话题再命中 → 刷新 Event 上下文 */
  async evaluateTriggers() {
    let triggered = 0
    let refreshed = 0

    // 1. 首次触发
    const fresh = await this.prisma.topicCircleTopic.findMany({
      where: { triggeredAt: null },
    })
    for (const topic of fresh) {
      const type = this.ruleHit(topic.b3h, topic.b24h, topic.tmax, topic.tmaxTop5)
      if (!type) continue

      const eventId = await this.findOrCreateEvent(topic, type)

      await this.prisma.topicCircleTopic.update({
        where: { id: topic.id },
        data: { eventId, triggeredAt: new Date(), triggerType: type },
      })

      await this.taskService.assignAndGenerateForEvent(eventId)
      triggered++
    }

    // 2. 已触发话题再次命中：只刷新原 Event 上下文，不重复建任务
    const existing = await this.prisma.topicCircleTopic.findMany({
      where: { triggeredAt: { not: null }, eventId: { not: null } },
    })
    for (const topic of existing) {
      const type = this.ruleHit(topic.b3h, topic.b24h, topic.tmax, topic.tmaxTop5)
      if (!type) continue
      await this.prisma.event.update({
        where: { id: topic.eventId! },
        data: { summary: topic.summary },
      })
      refreshed++
    }

    this.logger.log(`触发判断完成：${triggered} 个新触发，${refreshed} 个上下文刷新`)
    return { triggered, refreshed }
  }

  /** 查询总结出的话题（可按主题圈筛选） */
  async getTopics(circle?: string) {
    return this.prisma.topicCircleTopic.findMany({
      where: circle ? { circle } : {},
      orderBy: { updatedAt: 'desc' },
    })
  }

  /** 跨路径去重：复用相似 Event（热搜路径已建），否则新建 */
  private async findOrCreateEvent(
    topic: { title: string; summary: string; coreFact: string },
    type: string,
  ): Promise<string> {
    const similarId = await this.findSimilarEventId(topic.coreFact)
    if (similarId) {
      await this.prisma.event.update({
        where: { id: similarId },
        data: { summary: topic.summary },
      })
      return similarId
    }

    const event = await this.prisma.event.create({
      data: {
        title: topic.title,
        summary: topic.summary,
        coreFact: topic.coreFact,
        verify: '信息有限',
        status: '内容生成中',
        regions: [],
        trigger: `topic_circle_${type}`,
        firstDiscoveredAt: new Date(),
      },
    })
    return event.id
  }

  /** 用 coreFact 向量在 Event 表召回最相似事件（跨路径去重） */
  private async findSimilarEventId(coreFact: string): Promise<string | null> {
    try {
      const [vector] = await this.embedding.embed([coreFact])
      const vecStr = toVectorLiteral(vector)
      const rows = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT id, 1 - ("coreFactEmbedding" <=> ${vecStr}::vector) AS similarity
        FROM "Event"
        WHERE "coreFactEmbedding" IS NOT NULL
        ORDER BY "coreFactEmbedding" <=> ${vecStr}::vector
        LIMIT 1
      `
      const top = rows[0]
      return top && Number(top.similarity) >= CROSS_PATH_MERGE_THRESHOLD ? top.id : null
    } catch (error) {
      this.logger.warn(`跨路径事件召回失败: ${(error as Error).message}`)
      return null
    }
  }

  /** 四条触发规则（或关系） */
  private ruleHit(
    b3h: number,
    b24h: number,
    tmax: number | null,
    tmaxTop5: boolean,
  ): string | null {
    if (b3h >= 3) return 'short_term'
    if (b24h >= 6) return 'sustained'
    if (tmax != null && tmax >= 3 && tmaxTop5) return 'burst'
    if (b3h >= 2 && tmax != null && tmax >= 2) return 'mixed'
    return null
  }

  /** 用 coreFact 向量在同圈找相似话题（≥0.95 合并） */
  private async findSimilarTopicId(
    circle: string,
    coreFact: string,
  ): Promise<string | null> {
    try {
      const [vector] = await this.embedding.embed([coreFact])
      const vecStr = toVectorLiteral(vector)
      const rows = await this.prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT id, 1 - ("coreFactEmbedding" <=> ${vecStr}::vector) AS similarity
        FROM "TopicCircleTopic"
        WHERE "coreFactEmbedding" IS NOT NULL AND circle = ${circle}
        ORDER BY "coreFactEmbedding" <=> ${vecStr}::vector
        LIMIT 1
      `
      const top = rows[0]
      return top && Number(top.similarity) >= TOPIC_MERGE_THRESHOLD ? top.id : null
    } catch (error) {
      this.logger.warn(`话题相似度召回失败: ${(error as Error).message}`)
      return null
    }
  }

  /** 写入 coreFact 向量（Prisma 不支持 vector，走原生 SQL） */
  private async setTopicEmbedding(topicId: string, vector: number[]): Promise<void> {
    const vecStr = toVectorLiteral(vector)
    await this.prisma.$executeRaw`
      UPDATE "TopicCircleTopic" SET "coreFactEmbedding" = ${vecStr}::vector WHERE id = ${topicId}
    `
  }

  /** 采集单个账号：handle → userId → 时间线，帖子 ID 去重 */
  private async collectAccount(rawHandle: string, circle: string): Promise<number> {
    const handle = rawHandle.replace(/^@/, '')

    const state = await this.prisma.topicCircleSyncState.findUnique({ where: { handle } })
    const since = state
      ? new Date(state.lastCollectedAt.getTime() - OVERLAP_MS)
      : new Date(Date.now() - FIRST_COLLECT_WINDOW_MS)

    const user = await this.twitter.getUserInfo(handle)

    let cursor: string | undefined
    let pages = 0
    let collected = 0
    let finished = false

    while (!finished && pages < MAX_PAGES) {
      const page = await this.twitter.getUserTimeline(user.id, cursor)
      pages++

      if (page.tweets.length === 0) break

      for (const tweet of page.tweets) {
        const postedAt = tweet.createdAt ? new Date(tweet.createdAt) : new Date()
        if (postedAt < since) {
          finished = true
          break
        }
        await this.prisma.topicCirclePost.upsert({
          where: { postId: tweet.id },
          create: {
            postId: tweet.id,
            circle,
            handle,
            text: tweet.text,
            url: tweet.url,
            viewCount: tweet.viewCount ?? null,
            retweetCount: tweet.retweetCount ?? null,
            replyCount: tweet.replyCount ?? null,
            likeCount: tweet.likeCount ?? null,
            postedAt,
          },
          update: {},
        })
        collected++
      }

      if (!page.hasNextPage || !page.nextCursor) break
      cursor = page.nextCursor
    }

    await this.prisma.topicCircleSyncState.upsert({
      where: { handle },
      create: { handle, lastCollectedAt: new Date() },
      update: { lastCollectedAt: new Date() },
    })

    return collected
  }
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
