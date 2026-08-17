export interface EventFormation {
  coreFact: string
  title: string
  summary: string
  verify: string
  regions: string[]
  trigger: string
  signalTitles: string[]
}

export interface RelationCandidate {
  id: string
  title: string
  summary: string
}

export interface RelationInput {
  eventId: string
  title: string
  summary: string
  candidates: RelationCandidate[]
}

export interface RelationResult {
  eventId: string
  relatedId: string
  relationType: string
}

export interface EventItem {
  id: string
  title: string
  summary: string
  status: string
  verify: string
  regions: string
  trigger: string
  urls: string[]
  related: string[]
}

export interface EventListResponse {
  items: EventItem[]
  total: number
  page: number
  pageSize: number
}
