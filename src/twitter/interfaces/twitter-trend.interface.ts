export interface TwitterTrend {
  name: string
  query: string
  url: string
  heat: string
}

export type TrendSource = 'twitter' | 'mock'

export interface TrendsResult {
  trends: TwitterTrend[]
  source: TrendSource
}
