export type Severity = 'failure' | 'warning'

export type CheckName = 'expanded-state' | 'modal-walk' | 'error-association'

export type FindingCode =
  | 'expanded-state/state-contradicts-target'
  | 'expanded-state/pointer-only'
  | 'expanded-state/cannot-take-focus'
  | 'expanded-state/not-a-tab-stop'
  | 'expanded-state/aria-expanded-overrides-native-state'
  | 'expanded-state/aria-expanded-contradicts-native-state'
  | 'expanded-state/press-changes-nothing'
  | 'expanded-state/browser-misreports-native-state'
  | 'modal-walk/no-dialog-opens'
  | 'modal-walk/enter-does-not-open'
  | 'modal-walk/opener-cannot-take-focus'
  | 'modal-walk/focus-does-not-move-in'
  | 'modal-walk/tab-reaches-page-behind'
  | 'modal-walk/tab-closes-dialog'
  | 'modal-walk/blank-stop-behind-dialog'
  | 'modal-walk/focus-stays-off-page'
  | 'modal-walk/escape-does-not-close'
  | 'modal-walk/close-control-does-not-close'
  | 'modal-walk/focus-does-not-return'
  | 'error-association/invalid-field-has-no-message'
  | 'error-association/tied-message-is-empty'
  | 'error-association/tied-message-is-hidden'
  | 'error-association/visible-error-is-not-tied'

export type CodeOf<Check extends CheckName> = Extract<FindingCode, `${Check}/${string}`>

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
  code: FindingCode
  severity: Severity
  criteria: string[]
  element: FoundElement
  what: string
  context: CheckContext
}
