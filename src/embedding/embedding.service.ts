import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const DEFAULT_TIMEOUT_MS = 60_000

interface EmbeddingResponse {
  data?: Array<{ index: number; embedding: number[] }>
}

/**
 * Embedding 出口（OpenAI 兼容的 /embeddings 接口）。
 * 默认 text-embedding-3-small（1536 维），用于 Event 的 coreFact 向量化与归并去重。
 * 换供应商只改环境变量（EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL）。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly model: string

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('EMBEDDING_BASE_URL') ??
      'https://api.openai.com/v1'
    ).replace(/\/$/, '')
    this.apiKey = this.configService.get<string>('EMBEDDING_API_KEY') ?? null
    this.model =
      this.configService.get<string>('EMBEDDING_MODEL') ??
      'text-embedding-3-small'

    if (!this.apiKey) {
      this.logger.warn('未配置 EMBEDDING_API_KEY，向量检索不可用')
    } else {
      this.logger.log(`已配置 Embedding：${this.model} @ ${this.baseUrl}`)
    }
  }

  /** 把一批文本转成向量，返回与输入顺序一致的向量数组 */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_API_KEY 未配置，无法生成向量')
    }
    if (texts.length === 0) return []

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(
          `Embedding 调用失败 (${response.status}): ${text.slice(0, 300)}`,
        )
      }

      const data = (await response.json()) as EmbeddingResponse
      return (data.data ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Embedding 调用超时')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
