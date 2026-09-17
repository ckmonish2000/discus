import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  FileText,
  Files,
  Building2,
  SlidersHorizontal,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/documents', label: 'Documents', icon: Files },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/formats', label: 'Formats', icon: SlidersHorizontal },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
] as const

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2 px-5">
          <span className="grid h-7 w-7 place-items-center rounded bg-brand text-sm font-bold text-white">
            D
          </span>
          <span className="font-semibold tracking-tight">Discus</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-brand-light font-medium text-brand-dark'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                <Icon size={16} strokeWidth={2} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto hidden border-t border-line p-3 lg:block">
          <div className="truncate px-2 pb-2 text-xs text-ink-subtle">
            {user?.email}
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  )
}
