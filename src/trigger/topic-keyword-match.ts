export interface TopicSemanticConfig {
  name: string
  keywords?: string | null
  positiveExamples?: string | null
  negativeExamples?: string | null
}

const TERM_SPLIT_RE = /[、,，;；\n]+/

export function matchTrendingTopic(
  title: string,
  configs: TopicSemanticConfig[],
): TopicSemanticConfig | null {
  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return null

  for (const config of configs) {
    if (hasNegativeMatch(normalizedTitle, config.negativeExamples)) continue

    const terms = [
      config.name,
      ...splitTerms(config.keywords),
      ...splitTerms(config.positiveExamples),
    ]
    if (terms.some((term) => termMatches(normalizedTitle, term))) return config
  }

  return null
}

function splitTerms(value?: string | null): string[] {
  return (value ?? '')
    .split(TERM_SPLIT_RE)
    .map((term) => term.trim())
    .filter(Boolean)
}

function hasNegativeMatch(title: string, examples?: string | null): boolean {
  return splitTerms(examples).some((example) => {
    const normalized = normalize(example)
    return normalized && (title.includes(normalized) || normalized.includes(title))
  })
}

function termMatches(title: string, term: string): boolean {
  const normalized = normalize(term)
  if (!normalized) return false
  if (isLatinTerm(normalized)) {
    const titleTokens = tokenizeLatin(title)
    const termTokens = tokenizeLatin(normalized)
    if (termTokens.length === 0) return false
    return containsTokenSequence(titleTokens, termTokens)
  }

  if (title.includes(normalized)) return true

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length < 2) return false
  return words.every((word) => title.includes(word))
}

function isLatinTerm(value: string): boolean {
  return /^[a-z0-9 .]+$/.test(value)
}

function tokenizeLatin(value: string): string[] {
  return value.match(/[a-z0-9]+/g) ?? []
}

function containsTokenSequence(tokens: string[], sequence: string[]): boolean {
  for (let i = 0; i <= tokens.length - sequence.length; i++) {
    if (sequence.every((term, offset) => tokens[i + offset] === term)) return true
  }
  return false
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
