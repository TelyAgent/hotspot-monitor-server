# 事件生成架构（Event Generation Architecture）

> 状态：设计稿 v1
> 关联：`SPEC.md`（业务合同）、`../src/llm/`（大模型出口）、前端 `hotspot-monitor-master/src/pages/Events.tsx`

## 1. 背景与目标

把「外部原始数据」转化为有证据边界、可归并、可关联的 **Event**。当前原始数据只有 X 热搜榜单，但后续会持续增加来源（官方日历、RSS、人工导入、其他平台热榜等），因此本架构的核心诉求是：

1. **来源无关**：任何来源归一化为统一的 `RawSignal`，下游触发与事件生成不再感知具体来源。
2. **大模型驱动**：Event 的「形成 / 归并 / 摘要 / 核验 / 关联」由大模型完成，规则只负责确定性判断（排名阈值、快照比较）。
3. **证据边界**：严格遵守 SPEC 第 7 章——摘要不超过证据确定程度，未确认用限定表达，冲突不写成唯一事实。

---

## 2. 总体流水线

```text
┌───────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   ┌────────┐
│ 来源 Source   │──▶│ 归一化        │──▶│ 触发判断      │──▶│ LLM 事件形成         │──▶│ 写库    │
│ (x-trending)  │   │ → RawSignal  │   │ TR-01~TR-04   │   │ 形成/归并/摘要/核验/关联│   │ Event  │
│ (rss/官方/人工)│   │              │   │ (规则+LLM)    │   │                      │   │ Signal │
└───────────────┘   └──────────────┘   └──────────────┘   └──────────────────────┘   └────────┘
```

- **Source**：各自独立采集，产出一批原始条目。
- **归一化**：`SignalService` 把来源条目转成 `RawSignal` 并去重入库。
- **触发判断**：`TriggerService` 用规则判断 TR-01/02/04，用 LLM 做 TR-03 语义匹配。
- **事件形成**：`EventService` 编排大模型，产出/更新 Event。
- **写库**：Event + Signal + Evidence + EventRelation。

---

## 3. 前端字段契约（Event Card）

前端 `EventItem`（`hotspot-monitor-master/src/data/types.ts`）当前字段：

| 前端字段 | 含义 | 对应 SPEC 8.1 |
|---|---|---|
| `title` | Event 标题 | ① Event 标题 |
| `summary` | 一句话事实摘要 | ② 一句话事实摘要 |
| `status` | 响应状态（内容生成中/待发布/处理异常/已完成） | ⑨ 当前响应状态 |
| `verify` | 核验结论 | ⑧ 核验结论 |
| `regions` | 出现地区（字符串） | ④ 出现地区 |
| `trigger` | 命中原因（字符串） | ⑥ 命中原因 |
| `urls` | 事实依据 URL 列表 | ⑦ 事实依据按钮及原帖链接 |
| `related` | 关联 Event | ⑩ 关联 Event |

页面还展示了：EV 编号、更新时间（`最近更新3分钟前`）、依据数量、任务进度（`2/3`）。

**后端需要补齐、前端尚未展示的 SPEC 字段**（模型预留，后续接前端）：

- ③ 当前排名及变化 → `rank` / `rankChange`
- ⑤ 首次发现时间（T0）→ `firstDiscoveredAt`
- ⑪ 账号任务与完成情况 → 来自任务模块，不在 Event 表内

> 注意：SPEC 7.3 核验结论是三态 `信息一致 / 信息有限 / 存在冲突`，前端目前只区分「存在冲突 / 非冲突」，后端必须支持三态。

---

## 4. 原始数据抽象（RawSignal，多来源可扩展）

所有来源归一化为同一结构：

```ts
type SignalSource =
  | 'x-trending'        // X 热搜榜单（现有）
  | 'official-calendar' // 官方日历/公告（未来）
  | 'rss'               // RSS 订阅（未来）
  | 'manual-import'     // 人工导入（未来）

interface RawSignal {
  id: string               // 全局唯一
  source: SignalSource
  sourceItemId: string     // 来源内唯一 ID，用于幂等去重
  region?: string          // 地区（X 榜单有，其他来源可空）
  title: string            // 热搜词 / 标题 / 事件名
  summaryText?: string     // 原文摘要 / 正文片段
  url?: string             // 原始链接
  rank?: number            // 当前排名（X 榜单）
  previousRank?: number    // 上一成功快照排名（算「上升 N 位」用）
  snapshotId?: string      // 快照 ID（同批采集共享）
  collectedAt: Date        // 采集时间
  extra?: Record<string, unknown>  // 来源特有字段
}
```

**来源接入方式**：每个来源实现一个 `SignalSourceAdapter`：

```ts
interface SignalSourceAdapter {
  readonly source: SignalSource
  /** 采集一批原始条目（各自负责自己的调度/频率） */
  collect(): Promise<RawSignal[]>
}
```

- 现有 X 榜单：`XTrendingSourceAdapter`，把 `twitterapi.io` 的榜单 + 前一条快照排名转成 `RawSignal`。
- 未来来源：新增 adapter，`SignalService` 与下游完全不变。

---

## 5. 触发规则（TR-01 ~ TR-04）

| 编号 | 条件 | 判定方式 |
|---|---|---|
| TR-01 | 首次进入任一榜第 1–5 位 | **规则**：`rank <= 5` |
| TR-02 | 相邻成功快照上升 ≥10 位 | **规则**：`previousRank - rank >= 10` |
| TR-03 | 语义命中已配置重点主题 | **LLM**：语义匹配（不要求词面出现主题名） |
| TR-04 | 同一 Event 同时出现在 ≥2 地区 | **规则 + LLM**：先按地区分组，再判断跨地区是否为「同一核心事实」 |

> TR-04 的「同一核心事实」判断与事件归并复用同一个 LLM 能力（见 §6.1 的 `coreFact`）。

触发结果写入 `Signal` 的 `trigger` 字段（可组合，如 `TR-01+TR-04`），供 Event 留痕。

---

### 5.1 触发时机与执行频率

事件生成是**数据驱动**的——没有独立的后台定时扫描任务，只在有新 Signal 进入系统时才向下游推进。三个环节执行频率不同：

| 环节 | 执行时机 | 频率 |
|---|---|---|
| 触发判断 | 每次有成功的新快照 / 新 Signal 进入 | 高（X 榜单每小时；排期来源按其自身频率；人工导入即时） |
| LLM 事件形成 | **只在命中触发（TR-01~04）时** | 稀疏（不是每次数据更新都跑） |
| 非事实变化 | 排名/热度变化、新增地区、更多重复说法 | 只更新 Event Card，不重新走 LLM 事件形成（SPEC 8.5） |

补充约束：

1. **「数据更新」≠「事件生成」**：数据更新只保证触发判断会跑；只有命中触发规则，才调用大模型生成/归并 Event。
2. **非事实变化**（SPEC 8.5）：只改 Card 字段（排名/热度/跨区状态/依据），不重生成事件；人工可要求 AI 基于最新上下文重新生成内容。
3. **事件生成还有两类入口，不来自 X 榜单采集**：
   - `排期事件`：进入预热窗口、或实时 Signal 命中排期事件时，可能创建独立 Event（SPEC 15.9），频率由排期来源同步决定。
   - `人工`：人工导入 Signal、或运营手动提前启动，走同一套「触发 → 事件形成」流水线。
4. **统一原则**：所有 Event 生成的入口都是「新 Signal 进入系统」，所以 `RawSignal` 抽象让下游只依赖「有信号进来」，不关心来源和频率。

## 6. LLM 事件形成（核心）

触发后的流水线（SPEC 6.2）：

`触发 → 形成/归并 → 事实摘要与核验 → 历史 Event 关联`

### 6.1 步骤一：形成 / 归并

**输入**：一个已触发的 Signal + 其证据帖子（每地区最多 3 条，见 SPEC 7.1）+ 程序召回的候选现有 Event。

**程序召回**：按关键词 / `coreFact` 相似度召回少量候选 Event（不直接全量喂给模型）。

**LLM 输出契约**（`chatJson`）：

```json
{
  "action": "create" | "merge",
  "mergeTargetId": null,
  "coreFact": "一句话核心事实（用作归并去重键）",
  "title": "Event 标题",
  "summary": "一句话事实摘要",
  "verify": "信息一致" | "信息有限" | "存在冲突",
  "regions": ["Worldwide", "US"],
  "trigger": ["TR-01"],
  "reasoning": "简短理由"
}
```

- `action=merge` 且核心事实未变化 → 归并到现有 Event（SPEC 8.2），更新地区/排名/依据。
- `action=create`（新动作/结果/状态/口径）→ 新建 Event（SPEC 8.3）。

**事实边界（SPEC 7.2，写进 prompt 约束）**：
- 摘要只能描述「这些说法正在 X 上传播」，不等于现实事实确认。
- 未确认信息用「多个热门帖子称 / X 上正在讨论」等限定表达。
- 冲突时只描述有哪些说法，不把某一种写成唯一事实。

### 6.2 步骤二：事实摘要与核验

可并入步骤一输出，但保留独立 prompt 以便「校正摘要」单独调用（对应前端「校正摘要/依据」按钮）。

核验结论（SPEC 7.3）：
- `信息一致`：核心事实层面一致。
- `信息有限`：依据不足 / 关键字段缺失 / 单一来源。
- `存在冲突`：不同依据对同一核心事实给出不同说法。

### 6.3 步骤三：关联召回（SPEC 8.4）

1. 程序按主体 / 对象 / 语义关键词 / 时间召回少量历史 Event 候选。
2. **LLM 只在候选集合内**判断是否属于同一具体发展线。
3. 最多选 3 条，不足 3 条按实际；关联类型取「前置事件/后续进展/正式落地/结果公布/口径更正/事件反转」。

**输出契约**：

```json
{
  "relations": [
    { "eventId": "ev_xxx", "relationType": "后续进展" }
  ]
}
```

关联 Event 只作内容上下文，当前 Event 始终是主要事实（SPEC 8.4.4）。

---

## 7. 数据模型（Prisma）

在现有 `schema.prisma` 上扩展（新增 4 个模型）：

```prisma
model Signal {
  id           String   @id @default(cuid())
  source       String
  sourceItemId String
  region       String?
  title        String
  summaryText  String?
  url          String?
  rank         Int?
  previousRank Int?
  snapshotId   String?
  trigger      String?    // TR-01+TR-04
  collectedAt  DateTime
  eventId      String?
  event        Event?    @relation(fields: [eventId], references: [id])

  @@unique([source, sourceItemId, snapshotId])
  @@index([collectedAt])
}

model Event {
  id                String   @id @default(cuid())
  title             String
  summary           String
  coreFact          String   // LLM 生成的归并键
  verify            String   // 信息一致 | 信息有限 | 存在冲突
  status            String   // 内容生成中 | 待发布 | 处理异常 | 已完成
  regions           Json     // ["Worldwide","US"]
  trigger           String   // TR-01 / TR-01+TR-04
  rank              Int?
  rankChange        Int?
  firstDiscoveredAt DateTime // T0
  updatedAt         DateTime @updatedAt

  signals   Signal[]
  evidence  Evidence[]
  related   EventRelation[] @relation("from")

  @@index([coreFact])
  @@index([firstDiscoveredAt])
}

model Evidence {
  id      String  @id @default(cuid())
  eventId String
  region  String?
  url     String
  snippet String?
  order   Int
  event   Event   @relation(fields: [eventId], references: [id])
}

model EventRelation {
  id           String @id @default(cuid())
  fromEventId  String
  toEventId    String
  relationType String // 前置事件/后续进展/正式落地/结果公布/口径更正/事件反转
  from         Event  @relation("from", fields: [fromEventId], references: [id])
  to           Event  @relation("to", fields: [toEventId], references: [id])
}
```

**前端映射**：`Event.regions`（Json）→ 前端 `regions` 字符串（join `" / "`）；`Event.trigger` → 前端 `trigger`；`Evidence.url` → 前端 `urls`；`EventRelation.to` → 前端 `related`。

---

## 8. LLM 接口与 Prompt 契约

复用已建好的 `LlmService`（`chatJson<T>`），事件形成只定义三个 prompt 函数：

```
src/event/prompts/
  form-event.prompt.ts    # 步骤一：形成/归并 + 摘要 + 核验
  relate-event.prompt.ts  # 步骤三：关联召回判断
```

每个 prompt 由「系统提示词（角色 + JSON schema + SPEC 事实边界约束）+ 用户数据（signal/evidence/候选）」组成，输出走 `chatJson` 强类型解析。默认模型 `deepseek-chat`，`temperature` 建议 0.2（结构化输出）。

> 模型只负责「语义判断 + 结构化抽取」，确定性规则（排名、快照、URL 归属）一律代码实现，不交给模型。

---

## 9. NestJS 模块结构

```
src/
  llm/                    # 已建：LlmService（chat/chatText/chatJson）
  signal/
    signal.types.ts       # RawSignal / SignalSourceAdapter
    signal.module.ts
    signal.service.ts     # 归一化 + 去重 + 入库
    sources/
      x-trending.source.ts    # 现有 X 榜单 adapter
      (future: rss.source.ts / official.source.ts / manual.source.ts)
  trigger/
    trigger.module.ts
    trigger.service.ts    # TR-01/02/04 规则 + TR-03 LLM 语义匹配
  event/
    event.module.ts
    event.types.ts        # EventFormationResult 等
    event.service.ts      # 流水线编排（form → summary → relate）
    prompts/
      form-event.prompt.ts
      relate-event.prompt.ts
  monitor/                # 现有：采集调度（每小时采集 X 榜单）
  prisma/                 # 已建
```

调用链：`monitor`（采集）→ `signal`（归一化）→ `trigger`（判断）→ `event`（LLM 形成）→ `prisma`（写库）。

---

## 10. 实现里程碑

1. **M1 — 数据模型**：Prisma 加 Signal/Event/Evidence/EventRelation，`db push`。
2. **M2 — 信号归一化**：`SignalSourceAdapter` + `SignalService`；把现有 X 榜单采集接到 `RawSignal` 落库。
3. **M3 — 触发判断**：TR-01/02/04 规则 + TR-03 语义匹配（LLM）。
4. **M4 — 事件形成**：`EventService` + `form-event.prompt`，实现 create/merge + 摘要 + 核验，落库。
5. **M5 — 关联召回**：`relate-event.prompt`，程序召回 + LLM 判断，写 EventRelation。
6. **M6 — 接口**：`GET /api/event` 把 Event 列表/详情返回给前端 `Events.tsx`（替换当前 mock）。

---

## 11. 已确定的技术决策

1. **LLM 调用粒度**：批量调用——把一批 Signal 一起喂给模型，跨 Signal 聚合同一核心事实。
2. **证据帖子来源**：`GET /twitter/tweet/advanced_search?query={keyword}&queryType=Top`，取前 3 条作为依据。
3. **coreFact 归并去重**：引入 embedding 服务 + 向量检索（见 §12）。
4. **TR-04 跨区判断**：等 5 个地区快照都到齐后，聚合判一次。

## 12. Embedding 与向量检索

### 12.1 定位

`coreFact` 归并去重、历史 Event 关联召回都依赖「语义相似度」，用向量检索实现，不用简单字符串匹配。

### 12.2 Embedding 服务

复用 `LlmService` 的抽象思路，新增 `EmbeddingService`（OpenAI 兼容的 `/embeddings` 接口），把文本转成向量：

- 配置：`EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL`。
- 方法：`embed(texts: string[]): Promise<number[][]>`。

> 注意：DeepSeek 不提供 embedding 接口，需单独接一个 embedding 供应商（如 OpenAI `text-embedding-3-small`，或 SiliconFlow / 智谱等 OpenAI 兼容的中文 embedding）。

### 12.3 向量存储（pgvector）

- PostgreSQL 启用 `pgvector` 扩展；本地 Docker 镜像从 `postgres:16-alpine` 换成 `pgvector/pgvector:pg16`。
- `Event` 增加 `coreFactEmbedding` 向量列（Prisma 用 `Unsupported("vector(1536)")`，维度随模型定）。
- 归并/关联召回：embed 新 `coreFact` → `$queryRaw` 做 cosine 相似度 Top-K 召回候选 → 交给 LLM 判断。

### 12.4 去重/召回流程

```text
新 coreFact → embed → 向量 Top-K 召回候选 Event → LLM 判断 create / merge（关联召回 ≤3）
```
