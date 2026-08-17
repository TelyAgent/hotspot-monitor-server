import * as assert from 'node:assert/strict'
import {
  matchTrendingTopic,
  type TopicSemanticConfig,
} from './topic-keyword-match'

const configs: TopicSemanticConfig[] = [
  {
    name: 'AI 与科技',
    keywords: 'AI、LLM、OpenAI、NVIDIA、chip、人工智能、大模型',
    positiveExamples: '模型发布；芯片供应；AI 公司监管事件',
    negativeExamples: '普通消费电子促销；科幻影视里的 AI 话题；AI movie',
  },
  {
    name: '预测市场行业',
    keywords: 'prediction market、Polymarket、Kalshi、market resolution、CFTC、预测市场、结算、监管',
    positiveExamples: '预测市场平台融资、上线新产品、监管许可或执法',
    negativeExamples: '平台账号发布的普通体育、政治、Crypto 或宏观预测题本身',
  },
]

assert.equal(
  matchTrendingTopic('OpenAI', configs)?.name,
  'AI 与科技',
  'matches configured topic name/keyword in a trending title',
)

assert.equal(
  matchTrendingTopic('Kalshi CFTC approval', configs)?.name,
  '预测市场行业',
  'matches multi-keyword prediction-market trends',
)

assert.equal(
  matchTrendingTopic('AI movie trailer', configs),
  null,
  'does not match a negative example phrase',
)

assert.equal(
  matchTrendingTopic('JAIDEE 3RD SUNSHINE', configs),
  null,
  'does not match ai inside an unrelated word',
)

assert.equal(
  matchTrendingTopic('Cambridge', [
    {
      name: 'Crypto 与 Web3',
      keywords: 'bridge、wallet',
    },
  ]),
  null,
  'does not match bridge inside cambridge',
)

console.log('topic-keyword-match.spec.ts passed')
