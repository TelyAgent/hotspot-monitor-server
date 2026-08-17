// 未来事件排期的初始数据（首版五类来源：OPM / BEA / BLS / FOMC / 人工导入）。
// actionScore / evidence / windows / heat 均存为 JSON 列，形状与前端契约一致。

function score(
  total: number,
  heatMomentum: number,
  evidence: number,
  timeUrgency: number,
  contentReadiness: number,
) {
  const impactTotal = total - evidence - heatMomentum - timeUrgency - contentReadiness
  const scope = Math.floor(impactTotal / 3)
  const relevance = Math.floor((impactTotal - scope) / 2)
  const outcomeImportance = impactTotal - scope - relevance
  return {
    total,
    impact: { scope, relevance, outcomeImportance },
    evidence,
    heatMomentum,
    timeUrgency,
    contentReadiness,
    version: 'v1',
  }
}

function emptyHeat(query: string) {
  return {
    query,
    queryVersion: 'v1',
    monitoringStartedAt: null,
    buckets: [],
    last6h: 0,
    prev6h: 0,
    growthPct: null,
    intensityMultiple: null,
    cumulative: 0,
  }
}

function heatWith(query: string, counts: number[]) {
  const buckets = counts.map((count, i) => {
    const start = new Date(Date.UTC(2026, 7, 10, i * 6))
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 6 * 3600_000).toISOString(),
      count,
    }
  })
  const last6h = counts[counts.length - 1] ?? 0
  const prev6h = counts[counts.length - 2] ?? 0
  return {
    query,
    queryVersion: 'v1',
    monitoringStartedAt: buckets[0]?.startAt ?? null,
    buckets,
    last6h,
    prev6h,
    growthPct: prev6h > 0 ? Math.round(((last6h - prev6h) / prev6h) * 100) : null,
    intensityMultiple: null,
    cumulative: counts.reduce((s, c) => s + c, 0),
  }
}

const windows = { monitoring: null, preheat: null, live: null, followUp: null }

export const SEED_FUTURE_EVENTS = [
  {
    title: '美国 CPI 发布',
    subject: '美国劳工统计局',
    eventType: '经济数据',
    factTime: new Date('2026-09-11T12:30:00Z'),
    timezone: 'America/New_York',
    schedulePrecision: 'exact_time',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(88, 28, 18, 7, 6),
    evidence: [
      {
        id: 'ev-cpi-1',
        url: 'https://www.bls.gov/schedule/news_release/cpi.htm',
        sourceType: 'bls',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['CPI 于 9/11 8:30 ET 发布'],
      },
    ],
    windows,
    heat: heatWith('US CPI', [12, 18, 15, 22, 30, 41, 55, 68]),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '美国非农就业报告',
    subject: '美国劳工统计局',
    eventType: '经济数据',
    factTime: new Date('2026-09-04T12:30:00Z'),
    timezone: 'America/New_York',
    schedulePrecision: 'exact_time',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(82, 26, 18, 6, 6),
    evidence: [
      {
        id: 'ev-nfp-1',
        url: 'https://www.bls.gov/schedule/news_release/empsit.htm',
        sourceType: 'bls',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['就业报告于 9/4 发布'],
      },
    ],
    windows,
    heat: emptyHeat('US jobs report'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: 'FOMC 利率会议',
    subject: '美联储',
    eventType: '货币政策',
    factTime: new Date('2026-09-15T18:00:00Z'),
    timezone: 'America/New_York',
    schedulePrecision: 'date_range',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(90, 28, 20, 8, 8),
    evidence: [
      {
        id: 'ev-fomc-1',
        url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
        sourceType: 'fomc',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['9 月会议于 9/15–16 举行'],
      },
    ],
    windows,
    heat: emptyHeat('FOMC'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '美国 GDP 发布',
    subject: '美国经济分析局',
    eventType: '经济数据',
    factTime: new Date('2026-09-29T12:30:00Z'),
    timezone: 'America/New_York',
    schedulePrecision: 'exact_time',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(64, 18, 16, 4, 6),
    evidence: [
      {
        id: 'ev-gdp-1',
        url: 'https://www.bea.gov/news/schedule',
        sourceType: 'bea',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['GDP 于 9/29 发布'],
      },
    ],
    windows,
    heat: emptyHeat('US GDP'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '美国劳动节',
    subject: 'OPM 联邦假日',
    eventType: '联邦假日',
    factTime: new Date('2026-09-07T12:00:00Z'),
    timezone: 'UTC',
    schedulePrecision: 'date',
    confirmationLevel: 'fixed',
    expressionBoundary: 'factual',
    actionScore: score(40, 10, 16, 2, 4),
    evidence: [
      {
        id: 'ev-labor-1',
        url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/',
        sourceType: 'opm',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['劳动节为 9 月第一个周一'],
      },
    ],
    windows,
    heat: emptyHeat('Labor Day'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: 'Jackson Hole 央行年会',
    subject: '堪萨斯城联储',
    eventType: '货币政策',
    factTime: new Date('2026-08-27T12:00:00Z'),
    timezone: 'UTC',
    schedulePrecision: 'date',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(78, 24, 18, 5, 6),
    evidence: [
      {
        id: 'ev-jh-1',
        url: 'https://www.kansascityfed.org/research/jackson-hole-economic-symposium/',
        sourceType: 'fomc',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['年会于 8 月下旬举行'],
      },
    ],
    windows,
    heat: emptyHeat('Jackson Hole'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '美国个人消费支出（PCE）',
    subject: '美国经济分析局',
    eventType: '经济数据',
    factTime: new Date('2026-08-28T12:30:00Z'),
    timezone: 'America/New_York',
    schedulePrecision: 'exact_time',
    confirmationLevel: 'confirmed',
    expressionBoundary: 'factual',
    actionScore: score(70, 22, 16, 5, 6),
    evidence: [
      {
        id: 'ev-pce-1',
        url: 'https://www.bea.gov/news/schedule',
        sourceType: 'bea',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['PCE 于 8/28 发布'],
      },
    ],
    windows,
    heat: emptyHeat('PCE'),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '行业大会（待核验）',
    subject: '人工导入',
    eventType: '行业大会',
    factTime: null,
    timezone: 'UTC',
    schedulePrecision: 'unknown',
    confirmationLevel: 'needs_verification',
    expressionBoundary: 'internal_only',
    actionScore: score(30, 8, 8, 2, 4),
    evidence: [
      {
        id: 'ev-man-1',
        url: 'https://example.com/industry-summit',
        sourceType: 'manual',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['具体时间尚未官宣'],
      },
    ],
    windows,
    heat: emptyHeat(''),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
  {
    title: '加密监管听证（预期）',
    subject: '人工导入',
    eventType: '监管动态',
    factTime: null,
    timezone: 'UTC',
    schedulePrecision: 'unknown',
    confirmationLevel: 'expected',
    expressionBoundary: 'internal_only',
    actionScore: score(55, 16, 12, 3, 6),
    evidence: [
      {
        id: 'ev-man-2',
        url: 'https://financialservices.house.gov/calendar/',
        sourceType: 'manual',
        verifiedAt: '2026-08-17T08:00:00Z',
        claims: ['议程提及，时间待定'],
      },
    ],
    windows,
    heat: emptyHeat(''),
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'v1',
  },
]

export const SEED_SOURCE_STATUS = [
  {
    source: 'opm',
    enabled: true,
    lastSyncAt: new Date('2026-08-17T00:00:00Z'),
    status: 'ok',
    nextSyncAt: new Date('2027-01-01T00:00:00Z'),
    message: null,
  },
  {
    source: 'bea',
    enabled: true,
    lastSyncAt: new Date('2026-08-17T00:00:00Z'),
    status: 'ok',
    nextSyncAt: new Date('2026-08-18T00:00:00Z'),
    message: null,
  },
  {
    source: 'bls',
    enabled: true,
    lastSyncAt: new Date('2026-08-17T00:00:00Z'),
    status: 'ok',
    nextSyncAt: new Date('2026-08-18T00:00:00Z'),
    message: null,
  },
  {
    source: 'fomc',
    enabled: true,
    lastSyncAt: new Date('2026-08-17T00:00:00Z'),
    status: 'ok',
    nextSyncAt: new Date('2026-08-18T00:00:00Z'),
    message: null,
  },
  {
    source: 'manual',
    enabled: true,
    lastSyncAt: null,
    status: 'ok',
    nextSyncAt: null,
    message: '人工提交即时校验',
  },
]
