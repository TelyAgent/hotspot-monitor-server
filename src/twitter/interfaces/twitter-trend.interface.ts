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

export interface TweetAuthor {
  id?: string
  userName?: string
  name?: string
  followers?: number
}

export interface Tweet {
  id: string
  url: string
  text: string
  retweetCount?: number
  replyCount?: number
  likeCount?: number
  viewCount?: number
  createdAt?: string
  author?: TweetAuthor
}
