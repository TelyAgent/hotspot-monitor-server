import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SEED_SETTING_AUDIT, SEED_SETTINGS } from './settings.seed'
import { TOPIC_SEMANTIC_DEFAULTS } from './topic-semantics'

/** 各分区 → Prisma 模型名 + 可写列的映射（键即前端字段名，值为模型列名） */
const CATEGORY_DEFS = {
  connectors: { model: 'connector', columns: ['baseUrl', 'authMethod', 'syncFrequency', 'timeoutRetry', 'fallback'] },
  monitoring: { model: 'monitoringRule', columns: ['regions', 'threshold', 'compareWindow', 'action'] },
  topics: { model: 'topic', columns: ['keywords', 'positiveExamples', 'negativeExamples', 'action', 'accounts'] },
  accounts: { model: 'accountConfig', columns: ['xAccountId', 'type', 'skill', 'frequency', 'onFailure'] },
  product: { model: 'productConfig', columns: ['url', 'targetUsers', 'capability', 'forbidden', 'lastSync'] },
  risk: { model: 'riskRule', columns: ['rule', 'lowAction', 'midAction', 'highAction', 'afterRelease'] },
  tracking: { model: 'trackingRule', columns: ['timeRange', 'value', 'metrics', 'onFailure', 'goodExtend'] },
  futureSources: { model: 'futureSource', columns: ['url', 'method', 'evidenceLevel', 'syncFrequency', 'maxStale'] },
  permissions: { model: 'permission', columns: ['scope', 'overridable', 'effectiveOn', 'auditRequirement'] },
} as const

type Category = keyof typeof CATEGORY_DEFS

type SettingDelegate = {
  findMany: (args?: { orderBy?: Record<string, 'asc' | 'desc'> }) => Promise<unknown[]>
  findUnique: (args: { where: { id: string } }) => Promise<{ fields?: Record<string, unknown> } | null>
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
  delete: (args: { where: { id: string } }) => Promise<unknown>
  count: () => Promise<number>
}

export interface SettingPayload {
  name?: string
  description?: string
  enabled?: boolean
  fields?: Record<string, string>
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedIfEmpty()
    await this.backfillTopicSemantics()
  }

  /** 查询某分区：audit 返回审计记录，其余返回对应类型化表 */
  async getItems(category: string) {
    if (category === 'audit') {
      return this.prisma.settingAudit.findMany({ orderBy: { createdAt: 'desc' } })
    }
    return this.delegate(category).findMany({ orderBy: { createdAt: 'asc' } })
  }

  /** 新增配置项 */
  async createItem(category: string, data: SettingPayload) {
    const { columns, extras } = this.splitFields(category, data.fields)
    return this.delegate(category).create({
      data: {
        name: data.name ?? '',
        description: data.description ?? null,
        enabled: data.enabled ?? true,
        ...columns,
        fields: Object.keys(extras).length ? extras : undefined,
      },
    })
  }

  /** 更新配置项（按分区定位）；兜底 JSON 与既有 extras 合并，避免表单编辑清空种子参数 */
  async updateItem(category: string, id: string, data: SettingPayload) {
    const { columns, extras } = this.splitFields(category, data.fields)

    let fieldsPatch: Record<string, unknown> | null | undefined
    if (data.fields !== undefined) {
      const existing = await this.delegate(category).findUnique({ where: { id } })
      const merged = { ...(existing?.fields ?? {}), ...extras }
      fieldsPatch = Object.keys(merged).length ? merged : null
    }

    return this.delegate(category).update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...columns,
        ...(fieldsPatch !== undefined ? { fields: fieldsPatch } : {}),
      },
    })
  }

  /** 删除配置项（按分区定位） */
  async deleteItem(category: string, id: string) {
    return this.delegate(category).delete({ where: { id } })
  }

  /** 把前端 fields 对象拆成「可写列」和「兜底 JSON」两部分 */
  private splitFields(category: string, fields?: Record<string, string>) {
    const allowed = new Set<string>(CATEGORY_DEFS[category as Category]?.columns ?? [])
    const columns: Record<string, string> = {}
    const extras: Record<string, string> = {}
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (allowed.has(key)) columns[key] = value
      else extras[key] = value
    }
    return { columns, extras }
  }

  private delegate(category: string): SettingDelegate {
    const def = CATEGORY_DEFS[category as Category]
    if (!def) throw new NotFoundException(`未知设置分区：${category}`)
    return this.prisma[def.model as keyof PrismaService] as unknown as SettingDelegate
  }

  /** 每个分区各自判空并初始化，幂等 */
  private async seedIfEmpty() {
    let seeded = 0
    for (const [category, rows] of Object.entries(SEED_SETTINGS)) {
      const delegate = this.delegate(category)
      if ((await delegate.count()) > 0) continue
      await delegate.createMany({ data: rows })
      seeded += rows.length
    }

    if ((await this.prisma.settingAudit.count()) === 0) {
      await this.prisma.settingAudit.createMany({
        data: SEED_SETTING_AUDIT.map(([object, action, operator, version]) => ({
          object,
          action,
          operator,
          version,
        })),
      })
      seeded += SEED_SETTING_AUDIT.length
    }

    if (seeded > 0) this.logger.log(`设置已初始化：${seeded} 条记录`)
  }

  /** 既有数据库不重新 seed，启动时补齐五个默认主题缺失的语义配置 */
  private async backfillTopicSemantics() {
    let updated = 0
    for (const [name, defaults] of Object.entries(TOPIC_SEMANTIC_DEFAULTS)) {
      const topic = await this.prisma.topic.findUnique({
        where: { name },
        select: {
          id: true,
          keywords: true,
          positiveExamples: true,
          negativeExamples: true,
        },
      })
      if (!topic) continue

      const data = {
        ...(topic.keywords ? {} : { keywords: defaults.keywords }),
        ...(topic.positiveExamples
          ? {}
          : { positiveExamples: defaults.positiveExamples }),
        ...(topic.negativeExamples
          ? {}
          : { negativeExamples: defaults.negativeExamples }),
      }
      if (Object.keys(data).length === 0) continue

      await this.prisma.topic.update({ where: { id: topic.id }, data })
      updated++
    }
    if (updated > 0) this.logger.log(`主题语义配置已补齐：${updated} 个主题`)
  }
}
