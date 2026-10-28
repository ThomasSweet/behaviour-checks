import type { FindingCode, Severity } from './types.js'

interface Definition {
  severity: Severity
  criteria: readonly string[]
}

export const definitions = {
  'expanded-state/state-contradicts-target': { severity: 'failure', criteria: ['4.1.2'] },
  'expanded-state/pointer-only': { severity: 'failure', criteria: ['2.1.1'] },
  'expanded-state/cannot-take-focus': { severity: 'failure', criteria: ['2.1.1'] },
  'expanded-state/not-a-tab-stop': { severity: 'failure', criteria: ['2.1.1'] },
  'expanded-state/aria-expanded-overrides-native-state': { severity: 'failure', criteria: ['4.1.2'] },
  'expanded-state/aria-expanded-contradicts-native-state': { severity: 'warning', criteria: ['4.1.2'] },
  'expanded-state/press-changes-nothing': { severity: 'warning', criteria: ['4.1.2'] },
  'expanded-state/browser-misreports-native-state': { severity: 'warning', criteria: [] },
  'modal-walk/no-dialog-opens': { severity: 'failure', criteria: [] },
  'modal-walk/enter-does-not-open': { severity: 'failure', criteria: ['2.1.1'] },
  'modal-walk/opener-cannot-take-focus': { severity: 'failure', criteria: ['2.1.1'] },
  'modal-walk/focus-does-not-move-in': { severity: 'failure', criteria: ['2.4.3'] },
  'modal-walk/tab-reaches-page-behind': { severity: 'failure', criteria: ['2.4.3'] },
  'modal-walk/tab-closes-dialog': { severity: 'failure', criteria: ['2.4.3'] },
  'modal-walk/blank-stop-behind-dialog': { severity: 'warning', criteria: [] },
  'modal-walk/focus-stays-off-page': { severity: 'warning', criteria: ['2.4.3'] },
  'modal-walk/escape-does-not-close': { severity: 'warning', criteria: ['2.1.2'] },
  'modal-walk/close-control-does-not-close': { severity: 'failure', criteria: ['2.1.2'] },
  'modal-walk/focus-does-not-return': { severity: 'failure', criteria: ['2.4.3'] },
  'error-association/invalid-field-has-no-message': { severity: 'failure', criteria: ['3.3.1'] },
  'error-association/tied-message-is-empty': { severity: 'failure', criteria: ['3.3.1'] },
  'error-association/tied-message-is-hidden': { severity: 'warning', criteria: ['3.3.1'] },
  'error-association/visible-error-is-not-tied': { severity: 'failure', criteria: ['1.3.1'] },
} as const satisfies Record<FindingCode, Definition>

export function defined(code: FindingCode, wcag = true) {
  const { severity, criteria } = definitions[code]
  return { severity: severity as Severity, criteria: wcag ? [...criteria] : [] }
}
