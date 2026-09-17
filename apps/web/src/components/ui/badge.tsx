import { cn } from '@/lib/utils'

/**
 * Status is encoded in colour AND text, never colour alone — a red pill is
 * meaningless to a colourblind reader and to anyone scanning a printout.
 */
const TONES = {
  neutral: 'bg-surface-alt text-ink-muted ring-line-strong',
  info: 'bg-info-bg text-info ring-info/25',
  success: 'bg-success-bg text-success ring-success/25',
  warning: 'bg-warning-bg text-warning ring-warning/25',
  danger: 'bg-danger-bg text-danger ring-danger/25',
} as const

export type Tone = keyof typeof TONES

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const INVOICE_STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'info',
  paid: 'success',
  void: 'danger',
}

export const DOCUMENT_STATUS_TONE: Record<string, Tone> = {
  pending: 'neutral',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
}
