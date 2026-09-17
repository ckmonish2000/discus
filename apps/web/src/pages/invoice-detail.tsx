import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { invoicesApi, type InvoiceStatus } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge, INVOICE_STATUS_TONE } from '@/components/ui/badge'
import { Skeleton, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

const STATUSES: InvoiceStatus[] = ['draft', 'pending', 'approved', 'paid', 'void']

export function InvoiceDetailPage() {
  const { invoiceId } = useParams({ from: '/invoices/$invoiceId' })
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
  })

  const updateStatus = useMutation({
    mutationFn: (status: InvoiceStatus) => invoicesApi.update(invoiceId, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast('Status updated', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Update failed', 'error'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Invoice not found'}
        onRetry={() => void refetch()}
      />
    )
  }

  const extra = Object.entries(data.data ?? {})

  return (
    <>
      <Link
        to="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        Invoices
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.invoiceNumber ?? 'Untitled invoice'}
            </h1>
            <Badge tone={INVOICE_STATUS_TONE[data.status] ?? 'neutral'}>
              {data.status}
            </Badge>
            {data.confidence !== null ? (
              <Badge tone={data.confidence >= 0.8 ? 'success' : 'warning'}>
                {Math.round(data.confidence * 100)}% confidence
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Issued {shortDate(data.issueDate)} · due {shortDate(data.dueDate)} ·{' '}
            <span className="capitalize">{data.source}</span>
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Status</span>
          <select
            id="invoice-status"
            value={data.status}
            disabled={updateStatus.isPending}
            onChange={(e) => updateStatus.mutate(e.target.value as InvoiceStatus)}
            className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm capitalize outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </label>
      </header>

      {data.needsReview ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-warning">Needs review</p>
            <p className="mt-0.5 text-ink-muted">
              The mapping engine could not place every field from this document.
              Check the amounts and dates against the original before approving.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Line items" />
          {data.lineItems.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              No line items were extracted from this invoice.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                    <th className="px-5 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Unit</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tax</th>
                    <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3">{item.description ?? '—'}</td>
                      <td className="tabular px-4 py-3 text-right">
                        {item.quantity ?? '—'}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {money(item.unitPrice, data.currency)}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink-muted">
                        {item.taxRate === null ? '—' : `${item.taxRate}%`}
                      </td>
                      <td className="tabular px-5 py-3 text-right font-medium">
                        {money(item.lineTotal, data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <dl className="space-y-2 border-t border-line px-5 py-4 text-sm">
            <Total label="Subtotal" value={money(data.subtotal, data.currency)} />
            <Total label="Tax" value={money(data.taxTotal, data.currency)} />
            {data.discount ? (
              <Total label="Discount" value={money(data.discount, data.currency)} />
            ) : null}
            <Total
              label="Total"
              value={money(data.total, data.currency)}
              emphasis
            />
          </dl>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line text-sm">
              <Row label="Currency" value={data.currency} />
              <Row label="PO number" value={data.poNumber ?? '—'} />
              <Row label="Payment terms" value={data.paymentTerms ?? '—'} />
              <Row label="Created" value={shortDate(data.createdAt)} />
              {data.documentId ? (
                <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                  <dt className="text-ink-muted">Source document</dt>
                  <dd>
                    <Link
                      to="/documents"
                      className="font-medium text-brand hover:underline"
                    >
                      View
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {extra.length > 0 ? (
            <Card>
              <CardHeader
                title="Custom fields"
                subtitle="Fields from your format with no core column"
              />
              <dl className="divide-y divide-line text-sm">
                {extra.map(([key, value]) => (
                  <Row key={key} label={key} value={String(value)} />
                ))}
              </dl>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular truncate font-medium">{value}</dd>
    </div>
  )
}

function Total({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex justify-between border-t border-line pt-2 text-base font-semibold'
          : 'flex justify-between text-ink-muted'
      }
    >
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  )
}
