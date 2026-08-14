import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { TwitterService } from '../twitter/twitter.service'
import type { PublishedPost } from '@prisma/client'

const HOUR_MS = 60 * 60 * 1000
const TRACKING_2H_MS = 2 * HOUR_MS
const TRACKING_5H_MS = 5 * HOUR_MS
const TRACKING_14D_MS = 14 * 24 * HOUR_MS
const WELL_PERFORMING_WINDOW_MS = 48 * HOUR_MS
const WELL_PERFORMING_VIEWS = 1000

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterService,
  ) {}

  /** 每 2 小时：结束到期追踪 + 抓取在追踪期内的帖子指标 */
  @Cron(CronExpression.EVERY_2_HOURS)
  async trackPublishedPosts() {
    const now = new Date()

    await this.prisma.publishedPost.updateMany({
      where: {
        trackingStatus: { in: ['追踪中', '追踪异常'] },
        trackingEndsAt: { lte: now },
      },
      data: { trackingStatus: '已结束' },
    })

    const posts = await this.prisma.publishedPost.findMany({
      where: {
        trackingStatus: { in: ['追踪中', '追踪异常'] },
        trackingEndsAt: { gt: now },
      },
    })

    let fetched = 0
    for (const post of posts) {
      const done = await this.trackPost(post, now)
      if (done) fetched++
    }
    if (fetched > 0) this.logger.log(`本次抓取 ${fetched} 条帖子指标`)
  }

  private async trackPost(post: PublishedPost, now: Date): Promise<boolean> {
    const last = await this.prisma.postMetric.findFirst({
      where: { postId: post.id },
      orderBy: { capturedAt: 'desc' },
    })
    const ageMs = now.getTime() - post.publishedAt.getTime()
    const intervalMs = ageMs < 24 * HOUR_MS ? TRACKING_2H_MS : TRACKING_5H_MS
    if (last && now.getTime() - last.capturedAt.getTime() < intervalMs) return false

    const tweetId = extractTweetId(post.url)
    if (!tweetId) {
      this.logger.warn(`无法解析帖子 ID: ${post.url}`)
      return false
    }

    try {
      const metrics = await this.twitter.getTweetMetrics(tweetId)

      await this.prisma.postMetric.create({
        data: {
          postId: post.id,
          views: metrics.views,
          likes: metrics.likes,
          replies: metrics.replies,
          reposts: metrics.reposts,
          quotes: metrics.quotes,
          capturedAt: now,
        },
      })

      if (post.trackingStatus === '追踪异常') {
        await this.prisma.publishedPost.update({
          where: { id: post.id },
          data: { trackingStatus: '追踪中' },
        })
      }

      if (
        !post.wellPerforming &&
        ageMs < WELL_PERFORMING_WINDOW_MS &&
        (metrics.views ?? 0) >= WELL_PERFORMING_VIEWS
      ) {
        await this.prisma.publishedPost.update({
          where: { id: post.id },
          data: {
            wellPerforming: true,
            trackingEndsAt: new Date(post.publishedAt.getTime() + TRACKING_14D_MS),
          },
        })
        this.logger.log(`帖子表现良好，追踪期延长到 14 天: ${post.url}`)
      }

      return true
    } catch (error) {
      this.logger.warn(`抓取帖子指标失败 ${post.url}: ${(error as Error).message}`)
      if (post.trackingStatus !== '追踪异常') {
        await this.prisma.publishedPost.update({
          where: { id: post.id },
          data: { trackingStatus: '追踪异常' },
        })
      }
      return false
    }
  }
}

function extractTweetId(url: string): string | null {
  const m = url.match(/\/(?:status|statuses)\/(\d+)/)
  return m ? m[1] : null
}
