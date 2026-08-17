import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  TrendsResult,
  Tweet,
  TweetMetrics,
  TweetTimelinePage,
  TwitterTrend,
  TwitterUserInfo,
} from './interfaces/twitter-trend.interface'

// 第三方热搜接口 twitterapi.io：GET /twitter/trends?woeid={woeid}&count={count}
// 鉴权：X-API-Key 请求头
const TWITTERAPI_BASE = 'https://api.twitterapi.io'

// 未配置凭据或接口不可用时的模拟热搜，保证本地可运行
const MOCK_NAMES = [
  'OpenAI GPT-6',
  'US CPI',
  'Bitcoin',
  'World Cup',
  'Taylor Swift',
  'NVIDIA',
  'Stablecoin Act',
  'Champions League',
  'Apple Event',
  'Federal Reserve',
  'Ethereum',
  'NBA',
  'K-pop',
  'Japan election',
  'UK inflation',
  'SpaceX',
  'Netflix',
  'Oil prices',
  'Gold',
  'Tesla',
  'AI agents',
  'Climate summit',
  'Premier League',
  'Crypto ETF',
  'Olympics',
  'ChatGPT',
  'Gaming release',
  'US jobs report',
  'Formula 1',
  'Global markets',
]

const MOCK_TRENDS: TwitterTrend[] = MOCK_NAMES.map((name, i) => ({
  name,
  query: name,
  url: `https://x.com/search?q=${encodeURIComponent(name)}`,
  heat: `${Math.max(1, 98 - i * 2)}K posts`,
}))

interface TwitterApiTrendItem {
  trend?: {
    name?: string
    target?: { query?: string }
    rank?: number
    meta_description?: string
  }
}

interface TwitterApiTrendResponse {
  trends?: TwitterApiTrendItem[]
  status?: string
  msg?: string
}

@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name)
  private readonly apiKey: string | null

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TWITTERAPI_IO_KEY') ?? null

    if (this.apiKey) {
      this.logger.log('已配置 twitterapi.io API Key（X-API-Key）')
    } else {
      this.logger.warn('未配置 TWITTERAPI_IO_KEY，trending 接口将返回模拟数据')
    }
  }

  /**
   * 获取指定地区（WOEID）的热搜趋势，返回前 limit 条。
   * 接口不可用或调用失败时回退到模拟数据，并通过 source 字段标记。
   */
  async getTrends(woeid: number, limit: number): Promise<TrendsResult> {
    if (!this.apiKey) {
      return { trends: MOCK_TRENDS.slice(0, limit), source: 'mock' }
    }

    try {
      // 第三方接口 count 最小为 30
      const count = Math.max(30, limit)
      const url = `${TWITTERAPI_BASE}/twitter/trends?woeid=${woeid}&count=${count}`
      const response = await fetch(url, {
        headers: { 'X-API-Key': this.apiKey },
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`twitterapi.io 返回 ${response.status}: ${text.slice(0, 200)}`)
      }

      const body = (await response.json()) as TwitterApiTrendResponse
      if (body.status === 'error') {
        throw new Error(`twitterapi.io 返回错误: ${body.msg || '未知错误'}`)
      }

      const trends: TwitterTrend[] = (body.trends ?? []).slice(0, limit).map((item) => {
        const trend = item.trend ?? {}
        const name = trend.name ?? ''
        const query = trend.target?.query ?? name
        return {
          name,
          query,
          url: `https://x.com/search?q=${encodeURIComponent(query)}`,
          heat: trend.meta_description || '—',
        }
      })

      return { trends, source: 'twitter' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`获取热搜失败（woeid=${woeid}），回退到模拟数据: ${message}`)
      return { trends: MOCK_TRENDS.slice(0, limit), source: 'mock' }
    }
  }

  /**
   * 获取某个搜索词在 X「Top」排序下的热门帖子（用于事实依据）。
   * 对应 twitterapi.io 的 GET /twitter/tweet/advanced_search
   */
  async getTopPosts(keyword: string, count = 3): Promise<Tweet[]> {
    if (!this.apiKey) {
      throw new Error('TWITTERAPI_IO_KEY 未配置，无法获取帖子')
    }

    const url = `${TWITTERAPI_BASE}/twitter/tweet/advanced_search?query=${encodeURIComponent(
      keyword,
    )}&queryType=Top`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)

    try {
      const response = await fetch(url, {
        headers: { 'X-API-Key': this.apiKey },
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `twitterapi.io 帖子接口返回 ${response.status}: ${text.slice(0, 200)}`,
        )
      }

      const body = (await response.json()) as {
        tweets?: Tweet[]
        status?: string
        msg?: string
      }

      if (body.status === 'error') {
        throw new Error(`twitterapi.io 帖子接口错误: ${body.msg || '未知错误'}`)
      }

      return (body.tweets ?? []).slice(0, count)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`帖子接口超时: ${keyword}`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** 获取单条帖子的指标（浏览量/点赞/回复/转发/引用） */
  async getTweetMetrics(tweetId: string): Promise<TweetMetrics> {
    if (!this.apiKey) {
      throw new Error('TWITTERAPI_IO_KEY 未配置，无法获取帖子指标')
    }

    const url = `${TWITTERAPI_BASE}/twitter/tweets?tweet_ids=${tweetId}`
    const response = await fetch(url, { headers: { 'X-API-Key': this.apiKey } })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `twitterapi.io 帖子详情返回 ${response.status}: ${text.slice(0, 200)}`,
      )
    }

    const body = (await response.json()) as {
      tweets?: Array<{
        viewCount?: number
        likeCount?: number
        replyCount?: number
        retweetCount?: number
        quoteCount?: number
      }>
      status?: string
    }

    if (body.status === 'error') {
      throw new Error('twitterapi.io 帖子详情错误')
    }

    const tweet = body.tweets?.[0]
    if (!tweet) throw new Error('帖子不存在或已删除')

    return {
      views: tweet.viewCount ?? null,
      likes: tweet.likeCount ?? null,
      replies: tweet.replyCount ?? null,
      reposts: tweet.retweetCount ?? null,
      quotes: tweet.quoteCount ?? null,
    }
  }

  /** 解析 X handle（可带 @）→ 数字 userId */
  async getUserInfo(handle: string): Promise<TwitterUserInfo> {
    if (!this.apiKey) throw new Error('TWITTERAPI_IO_KEY 未配置，无法获取用户信息')

    const clean = handle.replace(/^@/, '')
    const url = `${TWITTERAPI_BASE}/twitter/user/info?userName=${encodeURIComponent(clean)}`
    const response = await fetch(url, { headers: { 'X-API-Key': this.apiKey } })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`twitterapi.io 用户信息返回 ${response.status}: ${text.slice(0, 200)}`)
    }

    const body = (await response.json()) as {
      data?: TwitterUserInfo
      status?: string
      msg?: string
    }
    if (body.status === 'error' || !body.data) {
      throw new Error(`twitterapi.io 用户信息错误: ${body.msg || '未找到用户'}`)
    }
    return body.data
  }

  /** 拉取用户时间线（按 userId，支持游标翻页，按 created_at 倒序） */
  async getUserTimeline(userId: string, cursor?: string): Promise<TweetTimelinePage> {
    if (!this.apiKey) throw new Error('TWITTERAPI_IO_KEY 未配置，无法获取用户时间线')

    const params = new URLSearchParams({ userId })
    if (cursor) params.set('cursor', cursor)
    const url = `${TWITTERAPI_BASE}/twitter/user/tweet_timeline?${params.toString()}`
    const response = await fetch(url, { headers: { 'X-API-Key': this.apiKey } })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`twitterapi.io 用户时间线返回 ${response.status}: ${text.slice(0, 200)}`)
    }

    const body = (await response.json()) as {
      tweets?: Tweet[]
      has_next_page?: boolean
      next_cursor?: string | null
      status?: string
      msg?: string
    }
    if (body.status === 'error') {
      throw new Error(`twitterapi.io 用户时间线错误: ${body.msg || '未知错误'}`)
    }

    return {
      tweets: body.tweets ?? [],
      hasNextPage: body.has_next_page ?? false,
      nextCursor: body.next_cursor ?? null,
    }
  }
}
