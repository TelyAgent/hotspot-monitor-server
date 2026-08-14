import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ACCOUNT_SEEDS } from './account.seed'

const LAYER_ORDER: Record<string, number> = { 基础层: 0, 人设层: 1 }

@Injectable()
export class AccountService implements OnModuleInit {
  private readonly logger = new Logger(AccountService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedIfEmpty()
  }

  /** 首次启动时初始化 12 类 × 2 个测试账号 */
  private async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.account.count()
    if (count > 0) return
    await this.prisma.account.createMany({ data: ACCOUNT_SEEDS })
    this.logger.log(`已初始化 ${ACCOUNT_SEEDS.length} 个测试账号`)
  }

  /** 获取账号列表，可按类型筛选；基础层在前 */
  async getAccounts(type?: string) {
    const where = type && type !== '全部' ? { type } : undefined
    const accounts = await this.prisma.account.findMany({ where })
    return accounts.sort(
      (a, b) =>
        (LAYER_ORDER[a.layer] ?? 99) - (LAYER_ORDER[b.layer] ?? 99) ||
        a.name.localeCompare(b.name),
    )
  }

  /** 获取所有账号类型（供前端筛选下拉） */
  async getAccountTypes(): Promise<string[]> {
    const rows = await this.prisma.account.findMany({
      distinct: ['type'],
      select: { type: true },
      orderBy: { type: 'asc' },
    })
    return rows.map((r) => r.type)
  }
}
