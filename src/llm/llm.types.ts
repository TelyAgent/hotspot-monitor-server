export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** 覆盖默认模型 */
  model?: string
  /** 采样温度，默认 0.7 */
  temperature?: number
  /** 最大生成 token 数 */
  maxTokens?: number
  /** 要求模型输出 JSON（用于分类等结构化场景） */
  json?: boolean
  /** 超时时间（毫秒），默认 120s */
  timeoutMs?: number
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LlmChatResult {
  content: string
  model: string
  usage: LlmUsage | null
}
