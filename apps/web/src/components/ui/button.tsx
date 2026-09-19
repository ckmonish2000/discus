import { cn } from '@/lib/utils'

const VARIANTS = {
  primary:
    'bg-brand text-white hover:bg-brand-dark disabled:bg-line-strong',
  secondary:
    'bg-surface text-brand ring-1 ring-inset ring-line-strong hover:bg-brand-light',
  ghost:
    'bg-transparent text-ink-muted hover:bg-surface-alt hover:text-ink',
  danger:
    'bg-danger text-white hover:brightness-90',
} as const

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-9 px-3.5 text-sm gap-1.5',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
}) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  )
}
