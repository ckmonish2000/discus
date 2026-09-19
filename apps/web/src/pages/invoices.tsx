import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { invoicesApi, type InvoiceFilters } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/shell'
import { Card } from '@/components/ui/card'
import { Badge, INVOICE_STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const PAGE = 20
const STATUSES = ['draft', 'pending', 'approved', 'paid', 'void'] as const

export function InvoicesPage() {
  const [filters, setFilters] = useState<InvoiceFilters>({ limit: PAGE, offset: 0 })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => invoicesApi.list(filters),
    placeholderData: keepPreviousData,
  })

  const set = (patch: InvoiceFilters) =>
    setFilters((f) => ({ ...f, ...patch, offset: 0 }))

  const items = data?.items ?? []
  const total = data?.pagination.total ?? 0
  const offset = filters.offset ?? 0

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={total ? `${total} invoice${total === 1 ? '' : 's'}` : undefined}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <FilterChip
            active={!filters.status && !filters.needsReview}
            onClick={() => set({ status: undefined, needsReview: undefined })}
          >
            All
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={filters.status === s}
              onClick={() => set({ status: s, needsReview: undefined })}
            >
              <span className="capitalize">{s}</span>
            </FilterChip>
          ))}
          <FilterChip
            active={filters.needsReview === 'true'}
            onClick={() => set({ needsReview: 'true', status: undefined })}
          >
            Needs review
          </FilterChip>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load invoices'}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No invoices match"
            description="Try a different filter, or upload a document to extract one."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <Th>Invoice</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-surface-alt">
                    <td className="px-4 py-3">
                      <Link
                        to="/invoices/$invoiceId"
                        params={{ invoiceId: invoice.id }}
                        className="font-medium text-brand hover:underline"
                      >
                        {invoice.invoiceNumber ?? 'Untitled'}
                      </Link>
                      {invoice.needsReview ? (
                        <Badge tone="warning" className="ml-2">
                          Review
                        </Badge>
                      ) : null}
                    </td>
                    <td className="tabular px-4 py-3 text-ink-muted">
                      {shortDate(invoice.issueDate)}
                    </td>
                    <td className="tabular px-4 py-3 text-ink-muted">
                      {shortDate(invoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-ink-muted">
                      {invoice.source}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={INVOICE_STATUS_TONE[invoice.status] ?? 'neutral'}>
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-medium">
                      {money(invoice.total, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE ? (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-xs text-ink-muted">
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setFilters((f) => ({ ...f, offset: offset - PAGE }))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!data?.pagination.hasMore}
                onClick={() => setFilters((f) => ({ ...f, offset: offset + PAGE }))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 font-medium', className)}>{children}</th>
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-brand text-white'
          : 'bg-surface-alt text-ink-muted hover:bg-brand-light hover:text-brand-dark',
      )}
    >
      {children}
    </button>
  )
}
