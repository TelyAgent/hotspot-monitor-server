export interface TrendingItem {
  rank: number
  name: string
  query: string
  url: string
  heat: string
}

export interface TrendingResponse {
  region: string
  collectedAt: string
  source: 'twitter' | 'mock'
  items: TrendingItem[]
}
