import { expect, it } from 'vitest'
import { es } from '../../i18n/es'
import { approvalCopy } from './approvalCopy'
import type { ApprovalTimelineItem } from './types'

const t = (key: string, vars: Record<string, string | number> = {}) =>
  String((es as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))

const item = (over: Partial<ApprovalTimelineItem>): ApprovalTimelineItem => ({
  id: 'a1', type: 'approval', approvalId: 'apr_1', status: 'pending', capability: 'shell.exec',
  risk: 'high', description: 'shell.exec: rm -rf build', ...over,
} as ApprovalTimelineItem)

it('a recursive delete inside the project says it is a whole folder that skips the bin', () => {
  expect(approvalCopy(item({ ruleId: 'delete_recursive' }), t).title).toBe('Borrar una carpeta entera dentro del proyecto (no va a la papelera)')
})

it('a read-only test run names its runner', () => {
  expect(approvalCopy(item({ ruleId: 'read_only_tests:pytest', risk: 'medium' }), t).title).toBe('Correr las pruebas con pytest en modo solo lectura')
})

it('an unknown rule keeps the Engine text', () => {
  expect(approvalCopy(item({ ruleId: 'something_new' }), t).title).toBe('shell.exec: rm -rf build')
})
