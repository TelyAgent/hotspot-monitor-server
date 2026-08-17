# Hotspot Monitor SPEC 索引

本目录只保留当前有效的权威规则。阅读顺序如下：

| 顺序 | SPEC | 权威范围 |
|---:|---|---|
| 1 | [平台总规则](./spec-platform-rules/SPEC.md) | 全平台共同对象、Event 合同、内容链路、风险、发布、追踪与治理 |
| 2 | [主题圈雷达](./spec-topic-circle-radar/SPEC.md) | 主题圈账号、采集、同一事件识别、关注度指标与触发规则 |
| 3 | [未来事件运营排期](./spec-future-event-operations/SPEC.md) | 未来事件来源、证据、窗口、X Post Count、Action Score 与响应机制 |
| 4 | [热点内容生成 Skill](./spec-hotspot-content-generation-skill/SPEC.md) | 三条自动内容生产线、生产线—账号映射、三候选合同与九个账号运营 Skill |

## 权威边界

- 平台共同规则只在“平台总规则”维护。
- 主题圈细则只在“主题圈雷达”维护。
- 未来事件细则只在“未来事件运营排期”维护。
- 内容生成 Skill 清单与职责只在“热点内容生成 Skill”维护。
- 专项 SPEC 与平台总规则冲突时：专项内部规则以专项 SPEC 为准，跨模块 Event、风险、发布和审计合同以平台总规则为准。

历史 Phase 0、重复解释稿和过渡性拆分文件已移至 `_bmad-output/archive/specs/`，不再作为当前实现依据。
