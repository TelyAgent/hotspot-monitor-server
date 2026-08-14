import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { RawSignal } from './signal.types'

@Injectable()
export class SignalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 归一化原始信号并落库。
   * 靠 `@@unique([source, sourceItemId, snapshotId])` 幂等去重，
   * 同一来源同一条目同一快照只保留一条。
   */
  async ingest(signals: RawSignal[]): Promise<number> {
    if (signals.length === 0) return 0

    const result = await this.prisma.signal.createMany({
      data: signals.map((s) => ({
        source: s.source,
        sourceItemId: s.sourceItemId,
        region: s.region ?? null,
        title: s.title,
        summaryText: s.summaryText ?? null,
        url: s.url ?? null,
        rank: s.rank ?? null,
        previousRank: s.previousRank ?? null,
        snapshotId: s.snapshotId ?? null,
        collectedAt: s.collectedAt,
        extra: s.extra ? (s.extra as Prisma.InputJsonValue) : undefined,
      })),
      skipDuplicates: true,
    })

    return result.count
  }
}
