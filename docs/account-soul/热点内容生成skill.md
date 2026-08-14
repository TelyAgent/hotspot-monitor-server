# 热点内容生成skill

热点监控系统的内容 Skill 总表。它由两组能力组成：三条自动内容生产线，以及九个独立账号运营 Skill。

## 一、自动内容生产线（已定型）

上游完成事件筛选、来源汇集和事件卡构建后，将同一张事件卡同时传入以下三条生产线。三者都必须返回审核草稿 `DRAFT`；不负责再判断是否要响应。

| 内容类型 | Skill | 任务 | 固定输出 |
|---|---|---|---|
| 快讯 | [respond-with-breaking-brief](/Users/rachelyuan/growth/growthops/skills/respond-with-breaking-brief/SKILL.md) | 把热点压缩成可快速扫描的事实更新 | 一条 X 快讯：一个核心事实、恰当紧迫标签、必要归因与下一观察点 |
| 长文 | [develop-hotspot-deep-dive](/Users/rachelyuan/growth/growthops/skills/develop-hotspot-deep-dive/SKILL.md) | 选择最佳内容角度与表达引擎，完成分析型内容 | 一篇短分析，默认 100–180 英文词；复杂多源事件最高 500 词 |
| 产品承接 | [bridge-hotspot-to-product](/Users/rachelyuan/growth/growthops/skills/bridge-hotspot-to-product/SKILL.md) | 以 PredX 产品账号回应热点 | 一条产品账号内容：`market_bridge`、`ambient_brand` 或 `quiet_presence` 之一 |

### 共同输入

`event_id`、事件摘要、来源文章、发生/发布时间、已确认事实、不确定项、短期上下文、关联历史与未来节点。产品承接可额外接收关联市场、时间戳市场数据、产品落地页和视觉上下文。

### 边界

- 快讯只写新事实与即时观察点，不做产品露出或深度解释。
- 长文必须写，但不承担产品转化；只有上游明确提供产品语境或写作指令时，才可加入一条上下文产品句。
- 产品承接必须写；真实市场关联用 `market_bridge`，无真实关联时用 `ambient_brand`，敏感事件用克制的 `quiet_presence`。
- 三者均为审核草稿，不代表自动发布。

## 二、账号运营 Skill（9 个）

以下是独立的账号运营系统。每个 Skill 保存对应账号可观察到的选题、篇幅、互动与表达方法；使用时以“运营模式基准”工作，不模仿身份或原句。

| 账号运营 Skill | 账号特征与最佳内容场景 |
|---|---|
| [Nick Preszler](/Users/rachelyuan/.codex/skills/nick-preszler-content-operator/SKILL.md) | 低频、二阶洞察；适合机制、激励、指标误读与持久性观点。 |
| [Manifold Markets](/Users/rachelyuan/.codex/skills/manifold-markets-content-operator/SKILL.md) | 社区原生预测市场品牌；适合把未决事件转成概率问题、市场参与和规则解释。 |
| [WatcherGuru](/Users/rachelyuan/.codex/skills/watcherguru-content-operator/SKILL.md) | 标准化高速快讯台；适合金融、加密、政策和机构性突发的单事实更新。 |
| [RohOnChain](/Users/rachelyuan/.codex/skills/roh-onchain-content-operator/SKILL.md) | 可收藏的教育型内容；适合工具、课程、研究和趋势拆成学习路径或资源清单。 |
| [Unusual Whales](/Users/rachelyuan/.codex/skills/unusual-whales-content-operator/SKILL.md) | 资金与权力雷达；适合公司、监管、政治与公共财政中的金额、利益和后果。 |
| [Daily Loud](/Users/rachelyuan/.codex/skills/daily-loud-content-operator/SKILL.md) | 视觉优先的娱乐文化资讯；适合明星、音乐、体育、创作者及病毒事件。 |
| [Pubity](/Users/rachelyuan/.codex/skills/pubity-content-operator/SKILL.md) | 大众化、积极、可分享；适合成就、科学、人文、纪念日和直观事实卡。 |
| [Nate Silver](/Users/rachelyuan/.codex/skills/nate-silver-content-operator/SKILL.md) | 概率校准、基准比较、激励分析和可证伪结论；适合热点后的分析回应。 |
| [Domer](/Users/rachelyuan/.codex/skills/domer-content-operator/SKILL.md) | 低频高信号的预测市场调查；适合规则、结算、资金流、异常和复盘。 |

## 三、协作关系

```text
热点监控与事件卡
        │
        ├── 快讯 Skill ─────────────→ 快讯审核稿
        ├── 长文 Skill ─────────────→ 长文审核稿
        └── 产品承接 Skill ─────────→ 产品账号审核稿

账号运营 Skill（9 个）
        └── 作为各自账号的独立运营与内容生产能力运行
```

三条自动生产线和九个账号运营 Skill 处在同一内容能力库中，但职责不同：前者按上游事件卡稳定批量生产三种内容，后者按具体账号的运营方法生产、审阅、互动或规划内容。除非另有明确指令，不互相改写规则，也不改变已定型的三条自动生产线。
