import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { PostMetric } from '@prisma/client'

const DAY_MS = 24 * 60 * 60 * 1000

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInsights(range: string) {
    const from = getRangeStart(range)

    const posts = await this.prisma.publishedPost.findMany({
      where: { publishedAt: { gte: from } },
      include: { task: { include: { account: true } } },
    })

    const trackingPosts = posts.filter((p) => p.trackingStatus === '追踪中').length
    const wellPerforming = posts.filter((p) => p.wellPerforming).length
    const wellPerformingRate = posts.length ? wellPerforming / posts.length : 0

    // 每个帖子取最新一条指标快照
    const metricRows: PostMetric[] = posts.length
      ? await this.prisma.postMetric.findMany({
          where: { postId: { in: posts.map((p) => p.id) } },
          orderBy: { capturedAt: 'desc' },
        })
      : []
    const latestByPost = new Map<string, PostMetric>()
    for (const m of metricRows) {
      if (!latestByPost.has(m.postId)) latestByPost.set(m.postId, m)
    }

    // 平均互动率 = (点赞+回复+转发) / 浏览
    let totalInteractions = 0
    let totalViews = 0
    for (const m of latestByPost.values()) {
      totalInteractions += (m.likes ?? 0) + (m.replies ?? 0) + (m.reposts ?? 0)
      totalViews += m.views ?? 0
    }
    const avgInteractionRate = totalViews ? totalInteractions / totalViews : 0

    // 账号表现：平均浏览 + 表现良好率
    const accountAgg = new Map<
      string,
      { totalViews: number; wellPerforming: number; count: number }
    >()
    for (const p of posts) {
      const accountId = p.task.accountId
      const agg = accountAgg.get(accountId) ?? { totalViews: 0, wellPerforming: 0, count: 0 }
      agg.totalViews += latestByPost.get(p.id)?.views ?? 0
      agg.count += 1
      if (p.wellPerforming) agg.wellPerforming += 1
      accountAgg.set(accountId, agg)
    }
    const accounts = [...accountAgg.entries()]
      .map(([accountId, agg]) => {
        const account = posts.find((p) => p.task.accountId === accountId)?.task.account
        return {
          name: account?.name ?? accountId,
          avgViews: agg.count ? agg.totalViews / agg.count : 0,
          wellPerformingRate: agg.count ? agg.wellPerforming / agg.count : 0,
        }
      })
      .sort((a, b) => b.avgViews - a.avgViews)

    return {
      range,
      stats: { trackingPosts, wellPerformingRate, avgInteractionRate },
      accounts,
    }
  }
}

function getRangeStart(range: string): Date {
  const now = Date.now()
  switch (range) {
    case '30d':
      return new Date(now - 30 * DAY_MS)
    case '1y':
      return new Date(now - 365 * DAY_MS)
    default:
      return new Date(now - 7 * DAY_MS)
  }
}
