export interface AccountSeed {
  id: string
  name: string
  type: string
  layer: '基础层' | '人设层'
  skill: string
  persona: string
  takesAllEvents: boolean
}

// 三条自动内容生产线（承接所有事件）+ 九个账号运营 Skill（独立判断参与）
const TYPES: Array<{
  type: string
  layer: '基础层' | '人设层'
  skill: string
  persona: string
  takesAllEvents: boolean
  accounts: Array<{ id: string; name: string }>
}> = [
  {
    type: '快讯',
    layer: '基础层',
    skill: 'respond-with-breaking-brief',
    persona: '把热点压缩成可快速扫描的事实更新',
    takesAllEvents: true,
    accounts: [
      { id: 'predx-flash', name: 'PredX Flash' },
      { id: 'predx-breaking', name: 'PredX Breaking' },
    ],
  },
  {
    type: '长文',
    layer: '基础层',
    skill: 'develop-hotspot-deep-dive',
    persona: '选择最佳内容角度，完成分析型内容',
    takesAllEvents: true,
    accounts: [
      { id: 'predx-deep-dive', name: 'PredX DeepDive' },
      { id: 'predx-insight', name: 'PredX Insight' },
    ],
  },
  {
    type: '产品承接',
    layer: '基础层',
    skill: 'bridge-hotspot-to-product',
    persona: '以 PredX 产品账号回应热点',
    takesAllEvents: true,
    accounts: [
      { id: 'predx-markets', name: 'PredX Markets' },
      { id: 'predx-product', name: 'PredX Product' },
    ],
  },
  {
    type: 'Nick Preszler',
    layer: '人设层',
    skill: 'nick-preszler-content-operator',
    persona: '低频、二阶洞察；适合机制、激励、指标误读与持久性观点',
    takesAllEvents: false,
    accounts: [
      { id: 'nick-preszler', name: 'Nick Preszler' },
      { id: 'nick-preszler-2', name: 'Nick Preszler 副号' },
    ],
  },
  {
    type: 'Manifold Markets',
    layer: '人设层',
    skill: 'manifold-markets-content-operator',
    persona: '社区原生预测市场品牌；适合把未决事件转成概率问题',
    takesAllEvents: false,
    accounts: [
      { id: 'manifold-markets', name: 'Manifold Markets' },
      { id: 'manifold-markets-2', name: 'Manifold Markets 副号' },
    ],
  },
  {
    type: 'WatcherGuru',
    layer: '人设层',
    skill: 'watcherguru-content-operator',
    persona: '标准化高速快讯台；适合金融、加密、政策和机构性突发',
    takesAllEvents: false,
    accounts: [
      { id: 'watcher-guru', name: 'WatcherGuru' },
      { id: 'watcher-guru-2', name: 'WatcherGuru 副号' },
    ],
  },
  {
    type: 'RohOnChain',
    layer: '人设层',
    skill: 'roh-onchain-content-operator',
    persona: '可收藏的教育型内容；适合工具、课程、研究和趋势拆解',
    takesAllEvents: false,
    accounts: [
      { id: 'roh-onchain', name: 'RohOnChain' },
      { id: 'roh-onchain-2', name: 'RohOnChain 副号' },
    ],
  },
  {
    type: 'Unusual Whales',
    layer: '人设层',
    skill: 'unusual-whales-content-operator',
    persona: '资金与权力雷达；适合金额、利益和后果',
    takesAllEvents: false,
    accounts: [
      { id: 'unusual-whales', name: 'Unusual Whales' },
      { id: 'unusual-whales-2', name: 'Unusual Whales 副号' },
    ],
  },
  {
    type: 'Daily Loud',
    layer: '人设层',
    skill: 'daily-loud-content-operator',
    persona: '视觉优先的娱乐文化资讯',
    takesAllEvents: false,
    accounts: [
      { id: 'daily-loud', name: 'Daily Loud' },
      { id: 'daily-loud-2', name: 'Daily Loud 副号' },
    ],
  },
  {
    type: 'Pubity',
    layer: '人设层',
    skill: 'pubity-content-operator',
    persona: '大众化、积极、可分享',
    takesAllEvents: false,
    accounts: [
      { id: 'pubity', name: 'Pubity' },
      { id: 'pubity-2', name: 'Pubity 副号' },
    ],
  },
  {
    type: 'Nate Silver',
    layer: '人设层',
    skill: 'nate-silver-content-operator',
    persona: '概率校准、基准比较、激励分析和可证伪结论',
    takesAllEvents: false,
    accounts: [
      { id: 'nate-silver', name: 'Nate Silver' },
      { id: 'nate-silver-2', name: 'Nate Silver 副号' },
    ],
  },
  {
    type: 'Domer',
    layer: '人设层',
    skill: 'domer-content-operator',
    persona: '低频高信号的预测市场调查',
    takesAllEvents: false,
    accounts: [
      { id: 'domer', name: 'Domer' },
      { id: 'domer-2', name: 'Domer 副号' },
    ],
  },
]

export const ACCOUNT_SEEDS: AccountSeed[] = TYPES.flatMap((t) =>
  t.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: t.type,
    layer: t.layer,
    skill: t.skill,
    persona: t.persona,
    takesAllEvents: t.takesAllEvents,
  })),
)
