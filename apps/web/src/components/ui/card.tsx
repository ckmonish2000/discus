import { cn } from '@/lib/utils'

export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  )
}
