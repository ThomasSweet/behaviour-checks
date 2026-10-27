export type Severity = 'failure' | 'warning'

export type CheckName = 'expanded-state' | 'modal-walk' | 'error-association'

export interface FoundElement {
  selector: string
  label: string
}

export interface CheckContext {
  engine: string
  version: string
  viewport: [number, number] | null
}

export interface Finding {
  check: CheckName
  severity: Severity
  criteria: string[]
  element: FoundElement
  what: string
  context: CheckContext
}
