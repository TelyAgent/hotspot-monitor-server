---
id: SPEC-topic-circle-radar
version: 1.2
updated: 2026-08-17
status: final
companions: []
sources: []
---

# 主题圈雷达规则

> 状态：已收口，可进入产品设计与历史回放
>
> 版本：v1.2
>
> 日期：2026-08-14
> 适用范围：PredX 热点监控

## Why

主题圈雷达通过监控一组预先配置的 X 账号，识别不同表达是否指向同一具体事件，并根据圈内讨论广度与内容流量强度决定是否自动启动内容响应链路。

本文件是主题圈雷达的单项规则定稿。它覆盖此前关于体育优先试点、60 分钟快速窗口、3 小时 5 账号旧阈值、账号角色和重点账号等讨论结论；尚未同步改写其他 PRD 文件中的旧表述。

## Capabilities

- **CAP-1 主题圈配置**
  - **intent:** 运营人员可以维护五个目标主题圈及其监控账号。
  - **success:** 50 个账号可独立启停且各归属一个主题圈；讨论广度平权计算，重复子账号不会人为放大声量。
- **CAP-2 幂等采集**
  - **intent:** 系统可以持续获取主题圈账号的新内容并从失败点恢复。
  - **success:** 每 3 小时采集一次，使用 10 分钟重叠和帖子 ID 去重；失败后从上一次成功采集时间继续补齐。
- **CAP-3 同一事件识别**
  - **intent:** 系统可以先识别不同表达是否指向同一具体 Event，再计算关注度。
  - **success:** 主体、动作、对象、时间、地点和状态共同参与判断；置信度达到 0.95 才自动合并，低于门槛保留独立候选。
- **CAP-4 关注度计算**
  - **intent:** 系统可以用讨论广度和相对流量衡量圈内事件关注度。
  - **success:** B3h、B24h 和 Tmax 均按本文口径可重复计算，同账号重复表达和窗口外内容不虚增当前声量。
- **CAP-5 独立触发**
  - **intent:** 主题圈热议可以独立于 X 热搜启动统一响应。
  - **success:** 四条关注度规则任一首次命中即形成或复用 Event，多路径后续命中只补充上下文。
- **CAP-6 内容链路衔接**
  - **intent:** 主题圈 Event 可以复用平台的生产线、账号任务和人工发布合同。
  - **success:** 三条基础生产线为每个绑定账号建立唯一任务，每个触发账号生成 3 条候选，同 Event 同账号不重复建任务。
- **CAP-7 校准验证**
  - **intent:** 团队可以在正式自动下发前验证阈值和账号组合。
  - **success:** 历史回放或至少两周影子监测能够输出聚类准确率、命中率、误报率、发现延迟和触发贡献。

## 2. 主题圈范围

当前配置 5 个主题圈，每圈 10 个启用账号，共 50 个账号：

1. 政治与选举
2. Crypto 与 Web3
3. AI 与科技
4. 宏观经济与金融
5. 预测市场行业

体育赛事不配置主题圈，也不主动监控体育账号。体育事件如果自然进入 X 热搜，仍可按普通热搜规则处理；本期不设置体育主题的全局排除规则。

## 3. 账号配置原则

每个监控账号只保留以下配置：

- X handle；
- 所属主题圈；
- 启用或停用状态。

当前规则不配置账号角色、账号权重、重点账号或事实可信等级。所有启用账号在讨论广度计算中平权。

为避免人为放大声量，同一媒体或公司不应通过多个高度重复的子账号占据多个席位。账号是否可靠不由主题圈配置决定；事实状态在 Event 与 Evidence 层单独治理。

## 4. 最终账号清单

### 4.1 政治与选举

本圈以英语世界政治为主，重点覆盖美国选举，同时覆盖全球重大政治事件。

| 序号 | X 账号 |
|---:|---|
| 1 | [@Reuters](https://x.com/Reuters) |
| 2 | [@AP](https://x.com/AP) |
| 3 | [@CNNPolitics](https://x.com/CNNPolitics) |
| 4 | [@POLITICO](https://x.com/POLITICO) |
| 5 | [@axios](https://x.com/axios) |
| 6 | [@thehill](https://x.com/thehill) |
| 7 | [@nprpolitics](https://x.com/nprpolitics) |
| 8 | [@BBCWorld](https://x.com/BBCWorld) |
| 9 | [@DecisionDeskHQ](https://x.com/DecisionDeskHQ) |
| 10 | [@NateSilver538](https://x.com/NateSilver538) |

### 4.2 Crypto 与 Web3

| 序号 | X 账号 |
|---:|---|
| 1 | [@CoinDesk](https://x.com/CoinDesk) |
| 2 | [@Cointelegraph](https://x.com/Cointelegraph) |
| 3 | [@crypto](https://x.com/crypto) |
| 4 | [@WuBlockchain](https://x.com/WuBlockchain) |
| 5 | [@tier10k](https://x.com/tier10k) |
| 6 | [@WatcherGuru](https://x.com/WatcherGuru) |
| 7 | [@lookonchain](https://x.com/lookonchain) |
| 8 | [@BitcoinMagazine](https://x.com/BitcoinMagazine) |
| 9 | [@DecryptMedia](https://x.com/DecryptMedia) |
| 10 | [@DefiLlama](https://x.com/DefiLlama) |

### 4.3 AI 与科技

| 序号 | X 账号 |
|---:|---|
| 1 | [@OpenAI](https://x.com/OpenAI) |
| 2 | [@AnthropicAI](https://x.com/AnthropicAI) |
| 3 | [@GoogleDeepMind](https://x.com/GoogleDeepMind) |
| 4 | [@AIatMeta](https://x.com/AIatMeta) |
| 5 | [@huggingface](https://x.com/huggingface) |
| 6 | [@AndrewYNg](https://x.com/AndrewYNg) |
| 7 | [@karpathy](https://x.com/karpathy) |
| 8 | [@TechCrunch](https://x.com/TechCrunch) |
| 9 | [@verge](https://x.com/verge) |
| 10 | [@WIRED](https://x.com/WIRED) |

### 4.4 宏观经济与金融

| 序号 | X 账号 |
|---:|---|
| 1 | [@business](https://x.com/business) |
| 2 | [@ReutersBiz](https://x.com/ReutersBiz) |
| 3 | [@CNBC](https://x.com/CNBC) |
| 4 | [@FinancialTimes](https://x.com/FinancialTimes) |
| 5 | [@WSJ](https://x.com/WSJ) |
| 6 | [@TheEconomist](https://x.com/TheEconomist) |
| 7 | [@federalreserve](https://x.com/federalreserve) |
| 8 | [@BLS_gov](https://x.com/BLS_gov) |
| 9 | [@KobeissiLetter](https://x.com/KobeissiLetter) |
| 10 | [@DeItaone](https://x.com/DeItaone) |

### 4.5 预测市场行业

本圈只识别预测市场行业本身的事件，例如平台产品、监管、融资、合作、交易量、市场份额、概率异动、结算争议、市场诚信和行业竞争。平台发布的普通体育、政治、Crypto 或宏观预测问题仍归入对应事件主题，不因来源是预测市场平台而自动归入本圈。

| 序号 | X 账号 |
|---:|---|
| 1 | [@Polymarket](https://x.com/Polymarket) |
| 2 | [@Kalshi](https://x.com/Kalshi) |
| 3 | [@PolymarketIntel](https://x.com/PolymarketIntel) |
| 4 | [@OpinionLabsXYZ](https://x.com/OpinionLabsXYZ) |
| 5 | [@MyriadMarkets](https://x.com/MyriadMarkets) |
| 6 | [@PredictIt](https://x.com/PredictIt) |
| 7 | [@ZeitgeistPM](https://x.com/ZeitgeistPM) |
| 8 | [@PredictInsights](https://x.com/PredictInsights) |
| 9 | [@ManifoldMarkets](https://x.com/ManifoldMarkets) |
| 10 | [@metaculus](https://x.com/metaculus) |

### 4.6 主题语义关键词与正反例

语义关键词用于判断 X 热搜词是否属于已配置重点主题，也用于辅助主题圈帖子过滤和事件理解。关键词不是精确字符串白名单；系统可以结合主题名称、关键词、正例和反例做语义匹配。命中必须指向具体事件或明确趋势，不能只因为出现泛化词就触发。

#### 政治与选举

- 语义关键词：election、primary、poll、campaign、candidate、debate、ballot、vote、voter、turnout、polling、congress、senate、house、parliament、president、prime minister、administration、policy、bill、law、court ruling、sanction、diplomacy、war、ceasefire、protest、impeachment、indictment、referendum、民主党、共和党、选举、民调、投票、国会、总统、内阁、制裁、外交。
- 正例：候选人宣布参选或退选；关键州民调大幅变化；国会通过或阻止重大法案；最高法院或选举机构作出影响选举/政策的裁决；政府宣布制裁、停火、外交协议或重大政治任命。
- 反例：政客个人娱乐八卦；无政策或选举含义的名人争议；历史政治讨论或纪念日；泛泛的党派口水仗但没有新动作、新结果或新事实。

#### Crypto 与 Web3

- 语义关键词：Bitcoin、BTC、Ethereum、ETH、Solana、stablecoin、USDT、USDC、DeFi、DEX、CEX、ETF、token、airdrop、staking、restaking、L2、rollup、wallet、bridge、hack、exploit、rug pull、liquidation、mining、halving、SEC、CFTC、MiCA、Binance、Coinbase、Tether、Circle、加密货币、稳定币、链上、交易所、黑客、清算、代币、空投。
- 正例：BTC/ETH 或主流资产因监管、ETF、宏观或链上事件大幅波动；交易所、稳定币发行方或大型协议发生监管、融资、上线、宕机、攻击或清算事件；重要链上地址、协议收入、TVL、桥或钱包安全事件引发讨论。
- 反例：单个小币种无外部影响的价格喊单；NFT/游戏社区日常营销；没有事实来源的暴富叙事；普通金融市场新闻中仅顺带提到 crypto。

#### AI 与科技

- 语义关键词：AI、artificial intelligence、LLM、model、GPT、Claude、Gemini、Llama、DeepMind、OpenAI、Anthropic、Meta AI、Hugging Face、NVIDIA、GPU、chip、semiconductor、robotics、agent、AGI、safety、alignment、benchmark、release、API、lawsuit、antitrust、privacy、cybersecurity、AI regulation、人工智能、大模型、芯片、算力、机器人、智能体、安全、对齐、开源模型。
- 正例：模型发布、能力升级、价格或 API 改动；AI 公司融资、并购、诉讼、监管或安全事件；芯片供应、出口管制、数据中心或算力瓶颈；大型平台推出 AI 产品或撤回 AI 功能。
- 反例：普通消费电子促销；泛科技公司股价波动但无 AI/科技产品事实；科幻、游戏或影视里的 AI 话题；个人使用 AI 的技巧帖但没有行业事件。

#### 宏观经济与金融

- 语义关键词：CPI、PCE、inflation、jobs report、nonfarm payrolls、unemployment、GDP、PMI、retail sales、Fed、FOMC、rate cut、rate hike、yield、Treasury、bond、dollar、oil、gold、stocks、market crash、recession、tariff、trade、central bank、ECB、BOJ、BOE、earnings、banking crisis、通胀、非农、失业率、降息、加息、美联储、央行、国债、收益率、美元、黄金、油价、衰退、关税。
- 正例：CPI、非农、GDP、PMI 等关键数据公布并影响市场预期；央行利率决议、官员讲话或政策路径变化；债券收益率、美元、油价、黄金或股指因宏观事件大幅波动；银行、主权债务或贸易政策出现系统性风险信号。
- 反例：单家公司产品发布或普通财报解读；个人理财建议；没有宏观传导的个股波动；体育、娱乐或地缘新闻中没有市场/政策影响的信息。

#### 预测市场行业

- 语义关键词：prediction market、forecasting market、Polymarket、Kalshi、PredictIt、Manifold、Metaculus、odds、probability、market resolution、settlement、oracle、dispute、CFTC、regulation、election market、sports market、volume、open interest、liquidity、trader、forecast、probability shift、预测市场、概率、赔率、结算、争议、预言机、监管、交易量、流动性、概率异动。
- 正例：预测市场平台融资、上线新产品、监管许可或执法；重大市场结算、争议、操纵或诚信问题；某类市场交易量、流动性或概率出现行业级异动；平台之间竞争、合作、收购或政策变化。
- 反例：平台账号发布的普通体育、政治、Crypto 或宏观预测题本身；单个市场的日常概率小幅变化；用户晒单或营销活动；与预测市场机制、平台、监管或行业无关的普通新闻。

## 5. 双触发路径

X 热搜与主题圈雷达是两条独立、充分的内容响应触发路径。任一路径命中都启动同一条内容响应流水线，不要求两者共同命中。

### 5.1 X 热搜触发

- 已配置重点主题或关键词进入任意一个已采集地区的 X 热搜榜，即直接形成或匹配 Event 并启动内容响应；
- 普通主题首次进入热搜前 5，或在相邻两次成功快照间排名上升至少 10 位，即触发内容响应；
- X 热搜每小时采集一次。

已采集地区包括 Worldwide、United States、United Kingdom、Japan 和 Korea。重点主题或关键词命中热搜时，不要求进入前 5、排名上升或主题圈关注度达标；系统根据主题名称、语义关键词、正例和反例判断是否命中。

同一 Event 首次由重点主题热搜命中时启动响应；后续同词、同语义词或同一 Event 再次进入任一地区热搜，只更新原 Event 的地区、来源、帖子、摘要和上下文，不重复创建 Event 或响应任务。

热搜触发不等待主题圈账号数量或内容流量达到阈值。

### 5.2 主题圈关注度触发

主题圈事件的讨论广度或流量强度命中任一生效规则，即触发内容响应。主题圈触发不等待事件进入 X 热搜。

## 6. 主题圈采集规则

- 每 3 小时采集一次全部启用账号的新内容；
- 每次读取范围从上一次成功采集时间前 10 分钟开始，到本次采集时间结束；
- 使用帖子 ID 去重，10 分钟重叠只用于防止接口延迟和边界遗漏；
- 某次采集失败时，下次从上一次成功采集时间继续补齐；
- 讨论与流量窗口均以内容实际发布时间计算，不按采集批次或自然日分桶。

每 3 小时采集意味着主题圈触发的最坏发现延迟接近 3 小时；X 热搜路径仍保持每小时采集。

## 7. 有效内容范围

下列内容可以进入事件理解与主题圈计算：

- 原创帖子；
- 包含新增表达的引用帖；
- 包含实际表达内容的回复。

下列内容不计入讨论广度：

- 纯转发；
- 完全重复的内容；
- 明显广告或无关灌水；
- 与所属主题圈无关的内容；
- 无法识别所指具体事件的内容。

同一账号在同一窗口内多次讨论同一事件，只贡献 1 个讨论账号；相关帖子的流量可以持续更新。

## 8. 同一事件识别

系统先判断不同表达是否指向同一具体现实或未来事件，再计算关注度。事件识别至少考虑：

- 主体；
- 动作；
- 对象；
- 时间；
- 地点；
- 事件状态，例如传闻、计划、宣布、发生、完成、取消或否认。

相同主题、相似关键词、相同立场或同一人物不足以证明是同一 Event。长期议题下的不同现实动作应形成不同 Event，并可建立前置、后续、反转或其他 Event Relation。

事件匹配置信度达到 `0.95` 时可自动加入已有 Event；低于门槛时保留为独立候选。系统可以高置信度自动合并，不自动拆分。

## 9. 关注度指标

### 9.1 B3h：3 小时讨论广度

`B3h` 是滚动 3 小时内讨论同一 Event 的不同启用账号数。

### 9.2 B24h：24 小时讨论广度

`B24h` 是滚动 24 小时内讨论同一 Event 的不同启用账号数。它不按自然日清零。

### 9.3 Tmax：最高相对流量

`Tmax` 是一个 Event 关联内容中表现最强帖子的相对流量：

```text
Tmax = 当前帖子在相同帖龄下的表现 ÷ 该账号近期帖子在相同帖龄下的正常表现
```

账号正常表现以最近 30 条有效帖子的中位表现为初始基线。优先使用浏览增长速度；不可获得时，依次参考转发与引用、回复、点赞的增长。不同帖龄的数据不得直接比较。

## 10. 主题圈触发规则

满足以下任一条件，即形成主题圈关注度触发：

| 触发类型 | 条件 |
|---|---|
| 短期集中讨论 | `B3h >= 3` |
| 24 小时持续热议 | `B24h >= 6` |
| 单点流量爆发 | `Tmax >= 3`，且该帖子进入账号近期表现前 5% |
| 讨论与流量混合上升 | `B3h >= 2` 且 `Tmax >= 2` |

四条规则是“或”的关系。任一规则首次命中后，立即启动内容响应流水线；其他规则后续命中只更新原 Event 上下文。

## 11. Event 记忆与当前声量

Event 对历史关联信号、内容和事实演化持续保留上下文，不设置统一的 24 小时 Event 记忆期限。

当前热点声量只计算滚动 3 小时与滚动 24 小时窗口：

- 超过 3 小时的内容不计入 `B3h`；
- 超过 24 小时的内容不计入 `B24h`；
- 窗口外的内容仍可用于判断新帖子是否延续同一 Event；
- 历史累计账号数不得作为当前热度；
- 同一长期主题中的新动作、新结果或新发生应形成新的关联 Event。

## 12. 触发后的内容响应流水线

热搜或主题圈规则命中后，系统不等待人工决定是否响应，自动启动：

```text
触发
→ 创建或匹配 Event（重点主题热搜命中直接形成 Event；其他路径可先进入 Candidate Event 再形成）
→ 聚合相关来源和帖子
→ 形成 Event 与 Event Card
→ 调用快讯型、长文/深度分析型、产品承接型三条基础生产线
→ 为每条生产线当前绑定的每个可用账号分别创建响应任务
→ 每个触发响应的账号固定生成 3 条账号专属候选
→ 运营人员选择、调整并在 X 手动发布
→ 回填发布 URL 或失败原因
```

自动启动流水线不表示跳过来源聚合，也不表示自动向 X 发布。

## 13. 去重、更新与再激活

- 同一 Event 第一次命中任一触发规则时启动内容响应；
- 后续新增账号、流量、热搜地区、来源或事实只更新原 Event、Event Card 与既有任务；
- 同一 Event 同时命中热搜和主题圈路径时，不重复创建 Event 或响应任务；
- 同一 Event 首次由重点主题热搜命中后，后续同词、同语义词或同事件热搜命中只更新上下文；
- `Event × Account × Skill Version` 是当前响应任务的唯一边界；
- 已关闭 Event 出现新的实质事实或重新达到生效关注度规则时可以再激活；单纯重复旧讨论不得静默改写历史记录。

## 14. 事实、风险与发布边界

讨论广度和流量强度只表示事件受到关注，不表示事实成立、观点一致、来源可靠或内容可以直接发布。

Event 与候选必须保留适用的事实状态：

- 已确认；
- 未确认；
- 有冲突；
- 传闻；
- 已否认。

政治、法律、用户安全和其他内容一旦被平台预检判定为高风险，必须经过适用的人工审核门禁；所属主题本身不自动等于高风险。所有内容均由运营人员手动选择和发布。

## 15. 验收标准

主题圈雷达进入实施前应能用代表样本验证：

1. 50 个账号均可配置启停并且只属于一个主题圈；
2. 采集失败恢复后不会丢失上一次成功采集后的内容；
3. 纯转发、重复内容和同账号重复发文不会虚增讨论广度；
4. 不同表达指向同一 Event 时可以聚合，相同主题下的不同 Event 不会仅因关键词相似自动合并；
5. `B3h >= 3`、`B24h >= 6`、单点爆发和混合上升四条路径均可独立触发；
6. 重点主题进入 X 热搜时不等待主题圈规则即可触发；
7. 同一 Event 多路径命中不会产生重复响应任务；同一生产线绑定多个账号时，每个账号分别生成 3 条候选；
8. 窗口外历史内容可以支持事件匹配，但不会贡献当前 `B3h` 或 `B24h`；
9. 触发后可以追溯触发类型、窗口、账号、帖子、指标、聚类依据与规则版本；
10. 高风险内容未经人工审核不能进入发布回填。

## 16. 验证方式

正式自动下发前，先使用历史回放或不少于两周的影子监测校准：

- 事件聚类准确率；
- 有效热点命中率与误报率；
- 平均发现延迟；
- 四类触发规则的贡献分布；
- 每个账号的有效触发贡献；
- 同媒体重复与相互转述造成的虚假共振；
- 各主题圈达到 `B3h` 与 `B24h` 阈值的实际频率。

影子监测用于校准阈值和账号组合，不改变本文件定义的事实、风险、去重与人工发布边界。任何规则调整必须产生新版本并只影响后续判断。

## Constraints

- 主题圈讨论广度和流量只表示受到关注，不确认事实，也不替代 Event Evidence。
- 同一账号在同一窗口多次讨论同一 Event，只贡献一个讨论账号。
- 自动合并门槛为 0.95；系统不自动拆分 Event。
- 主题圈触发必须复用平台 Event、Context Pack、风险、账号任务和人工发布合同。
- 每个触发响应的账号固定生成 3 条候选；多来源或多规则命中不得重复创建同账号任务。
- 所有阈值、账号清单和调整均须版本化，变更只影响后续判断。

## Non-goals

- 不监控体育主题圈账号；
- 不为账号建立角色、权重、重点等级或永久可信等级；
- 不把所有预测市场平台帖子自动归入预测市场行业圈；
- 不使用历史累计讨论账号数代替当前窗口声量；
- 不因高流量自动确认事实；
- 不自动拆分 Event；
- 不自动向 X 发布内容；
- 当前版本不为不同主题圈配置不同阈值。

## Success signal

五个主题圈可以稳定采集 50 个账号内容、正确聚合同一具体 Event，并在 B3h、B24h、单点流量或混合上升任一路径命中时创建唯一 Event 与账号任务。系统不因重复账号、重复帖子、多路径命中或高流量而虚增关注度、重复生成任务或错误确认事实。

## Open Questions

- 当前没有阻塞实施的业务口径；具体 X API、字段可得性和成本在技术接入阶段确认。
