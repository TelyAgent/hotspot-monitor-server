import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TrendsResult, TwitterTrend } from './interfaces/twitter-trend.interface'

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
}
