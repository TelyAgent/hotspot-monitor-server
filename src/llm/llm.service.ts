import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ChatMessage, ChatOptions, LlmChatResult } from './llm.types'

const DEFAULT_TIMEOUT_MS = 120_000

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  model?: string
  error?: { message?: string }
}

/**
 * 大模型出口（当前接入 DeepSeek，走 OpenAI 兼容的 /chat/completions 接口）。
 * 通过环境变量可切换任意 OpenAI 兼容服务（如 OpenAI / Moonshot / Qwen 等）。
 *
 * 业务侧用法示例（热点分类）：
 *   const result = await llm.chatJson<{ category: string }>(
 *     [
 *       { role: 'system', content: '你是热点分类助手，输出 JSON：{"category": "..."}' },
 *       { role: 'user', content: '请给这条热搜分类：GPT-6 发布' },
 *     ],
 *     { temperature: 0.2 },
 *   )
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly defaultModel: string

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('LLM_BASE_URL') ?? 'https://api.deepseek.com'
    ).replace(/\/$/, '')
    this.apiKey = this.configService.get<string>('LLM_API_KEY') ?? null
    this.defaultModel =
      this.configService.get<string>('LLM_MODEL') ?? 'deepseek-chat'

    if (!this.apiKey) {
      this.logger.warn('未配置 LLM_API_KEY，大模型调用将抛出异常')
    } else {
      this.logger.log(`已配置大模型：${this.defaultModel} @ ${this.baseUrl}`)
    }
  }

  /** 原始调用：返回完整结果（含 content 与 usage） */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<LlmChatResult> {
    if (!this.apiKey) {
      throw new Error('LLM_API_KEY 未配置，无法调用大模型')
    }

    const body: Record<string, unknown> = {
      model: options.model ?? this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
    }
    if (options.maxTokens != null) body.max_tokens = options.maxTokens
    if (options.json) body.response_format = { type: 'json_object' }

    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`LLM 调用失败 (${response.status}): ${text.slice(0, 300)}`)
      }

      const data = (await response.json()) as OpenAiChatResponse
      if (data.error?.message) {
        throw new Error(`LLM 返回错误: ${data.error.message}`)
      }

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        model: data.model ?? (options.model ?? this.defaultModel),
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : null,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM 调用超时')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /** 便捷方法：直接返回文本内容 */
  async chatText(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<string> {
    const result = await this.chat(messages, options)
    return result.content
  }

  /** 便捷方法：要求 JSON 输出并解析为指定类型 */
  async chatJson<T>(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<T> {
    const result = await this.chat(messages, { ...options, json: true })
    const raw = result.content.trim()

    // 部分模型会把 JSON 包在 ```json 代码块里，做一次剥离
    const candidates = [
      raw,
      raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(),
    ]
    for (const text of candidates) {
      try {
        return JSON.parse(text) as T
      } catch {
        // 尝试下一个候选
      }
    }
    throw new Error(`LLM 返回内容无法解析为 JSON: ${raw.slice(0, 200)}`)
  }
}
