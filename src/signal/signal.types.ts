export type SignalSource =
  | 'x-trending'
  | 'official-calendar'
  | 'rss'
  | 'manual-import'

/** 所有来源归一化后的原始信号 */
export interface RawSignal {
  source: SignalSource
  sourceItemId: string
  region?: string
  title: string
  summaryText?: string
  url?: string
  rank?: number
  previousRank?: number
  snapshotId?: string
  collectedAt: Date
  extra?: Record<string, unknown>
}

/** 每个来源实现此接口：采集一批原始条目并归一化为 RawSignal */
export interface SignalSourceAdapter {
  readonly source: SignalSource
  collect(): Promise<RawSignal[]>
}
