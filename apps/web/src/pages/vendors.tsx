import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { vendorsApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/shell'
import { Card } from '@/components/ui/card'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states'

export function VendorsPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => vendorsApi.list({ search: search || undefined, limit: 50 }),
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Created automatically as invoices are extracted."
        action={
          <input
            id="vendor-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors"
            className="h-9 w-56 rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        }
      />

      <Card>
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load vendors'}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No vendors yet"
            description="Each extracted invoice matches or creates a vendor by name and tax ID."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Tax ID</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((vendor) => (
                  <tr key={vendor.id} className="transition-colors hover:bg-surface-alt">
                    <td className="px-5 py-3 font-medium">{vendor.name}</td>
                    <td className="tabular px-4 py-3 text-ink-muted">
                      {vendor.taxId ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {vendor.email ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      {shortDate(vendor.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
