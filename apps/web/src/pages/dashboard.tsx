import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText, AlertTriangle, TrendingUp, Clock } from 'lucide-react'
import { invoicesApi, documentsApi, type Invoice } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/shell'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge, INVOICE_STATUS_TONE } from '@/components/ui/badge'
import { Skeleton, EmptyState } from '@/components/ui/states'

export function DashboardPage() {
  const invoices = useQuery({
    queryKey: ['invoices', { limit: 100 }],
    queryFn: () => invoicesApi.list({ limit: 100 }),
  })

  const documents = useQuery({
    queryKey: ['documents', { limit: 50 }],
    queryFn: () => documentsApi.list({ limit: 50 }),
  })

  const items = invoices.data?.items ?? []
  const loading = invoices.isLoading

  // Totals only sum invoices sharing the dominant currency — adding GBP to
  // USD would produce a number that means nothing.
  const currency = items[0]?.currency ?? 'USD'
  const sameCurrency = items.filter((i) => i.currency === currency)
  const outstanding = sameCurrency
    .filter((i) => i.status === 'pending' || i.status === 'approved')
    .reduce((sum, i) => sum + (i.total ?? 0), 0)
  const paid = sameCurrency
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (i.total ?? 0), 0)

  const needsReview = items.filter((i) => i.needsReview).length
  const processing = (documents.data?.items ?? []).filter(
    (d) => d.status === 'pending' || d.status === 'processing',
  ).length

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Extraction activity and invoice totals across your workspace."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Outstanding"
          value={loading ? null : money(outstanding, currency)}
          hint={`${sameCurrency.filter((i) => i.status === 'pending' || i.status === 'approved').length} open`}
          icon={TrendingUp}
          tone="info"
        />
        <Stat
          label="Paid"
          value={loading ? null : money(paid, currency)}
          hint={`${sameCurrency.filter((i) => i.status === 'paid').length} settled`}
          icon={FileText}
          tone="success"
        />
        <Stat
          label="Needs review"
          value={loading ? null : String(needsReview)}
          hint="Fields the mapper could not place"
          icon={AlertTriangle}
          tone={needsReview > 0 ? 'warning' : 'neutral'}
        />
        <Stat
          label="In the queue"
          value={documents.isLoading ? null : String(processing)}
          hint="Documents awaiting extraction"
          icon={Clock}
          tone="neutral"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent invoices"
            action={
              <Link
                to="/invoices"
                className="text-xs font-medium text-brand hover:underline"
              >
                View all
              </Link>
            }
          />
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Upload a document and the extractor will create the first invoice here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {items.slice(0, 7).map((invoice) => (
                <RecentRow key={invoice.id} invoice={invoice} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="By status" />
          <StatusBreakdown items={items} loading={loading} />
        </Card>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | null
  hint: string
  icon: React.ComponentType<{ size?: number }>
  tone: 'info' | 'success' | 'warning' | 'neutral'
}) {
  const tones = {
    info: 'bg-info-bg text-info',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    neutral: 'bg-surface-alt text-ink-subtle',
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {label}
          </p>
          {value === null ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="tabular mt-1.5 truncate text-2xl font-semibold text-ink">
              {value}
            </p>
          )}
          <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tones[tone]}`}>
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

function RecentRow({ invoice }: { invoice: Invoice }) {
  return (
    <li>
      <Link
        to="/invoices/$invoiceId"
        params={{ invoiceId: invoice.id }}
        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-alt"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {invoice.invoiceNumber ?? 'Untitled invoice'}
          </p>
          <p className="whitespace-nowrap text-xs text-ink-muted">
            {shortDate(invoice.issueDate)}
          </p>
        </div>
        {invoice.needsReview ? (
          <Badge tone="warning">Review</Badge>
        ) : null}
        <Badge tone={INVOICE_STATUS_TONE[invoice.status] ?? 'neutral'}>
          {invoice.status}
        </Badge>
        <span className="tabular w-24 text-right text-sm font-medium">
          {money(invoice.total, invoice.currency)}
        </span>
      </Link>
    </li>
  )
}

/**
 * A bar per status, drawn from the same counts shown numerically beside it —
 * the bar is a scan aid, the number is the value.
 */
function StatusBreakdown({ items, loading }: { items: Invoice[]; loading: boolean }) {
  const statuses = ['draft', 'pending', 'approved', 'paid', 'void'] as const
  const counts = statuses.map((s) => ({
    status: s,
    count: items.filter((i) => i.status === s).length,
  }))
  const max = Math.max(1, ...counts.map((c) => c.count))

  if (loading) {
    return (
      <div className="space-y-4 p-5">
        {statuses.map((s) => (
          <Skeleton key={s} className="h-4 w-full" />
        ))}
      </div>
    )
  }

  const fills: Record<string, string> = {
    draft: 'var(--color-line-strong)',
    pending: 'var(--color-warning)',
    approved: 'var(--color-info)',
    paid: 'var(--color-success)',
    void: 'var(--color-danger)',
  }

  return (
    <div className="space-y-3.5 p-5">
      {counts.map(({ status, count }) => (
        <div key={status}>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="capitalize text-ink-muted">{status}</span>
            <span className="tabular font-medium text-ink">{count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${(count / max) * 100}%`,
                background: fills[status],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
