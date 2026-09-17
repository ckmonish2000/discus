import { useState, useRef } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Upload,
  Files,
  RotateCw,
  AlertTriangle,
  Trash2,
  Eye,
} from 'lucide-react'
import {
  documentsApi,
  invoicesApi,
  storageApi,
  type Document,
  type Invoice,
} from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/shell'
import { Card } from '@/components/ui/card'
import { Badge, DOCUMENT_STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { DocumentPreview } from '@/components/document-preview'

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<Document | null>(null)

  /**
   * Polls while anything is mid-extraction. The worker writes status changes
   * straight to Postgres, so the dashboard has no push channel — a short
   * interval is how a finished extraction appears without a manual refresh.
   */
  const documents = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.list({ limit: 50 }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      return items.some((d) => d.status === 'pending' || d.status === 'processing')
        ? 3000
        : false
    },
  })

  /**
   * The extracted invoices, indexed by document. The hashed object name means
   * nothing to a reader — what identifies a row is the invoice inside it, so
   * the table shows vendor, number and value rather than a filename.
   */
  const invoices = useQuery({
    queryKey: ['invoices', { forDocuments: true }],
    queryFn: () => invoicesApi.list({ limit: 100 }),
  })

  const byDocument = new Map<string, Invoice>()
  for (const inv of invoices.data?.items ?? []) {
    if (inv.documentId) byDocument.set(inv.documentId, inv)
  }

  const retry = useMutation({
    mutationFn: (id: string) => documentsApi.retry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast('Re-queued for extraction', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Retry failed', 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast('Document deleted', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
  })

  /**
   * Upload goes straight to MinIO with a presigned URL; the storage webhook
   * then registers the document and enqueues extraction. The browser never
   * proxies file bytes through the API.
   *
   * Only the filename is sent. The server owns the object path because the
   * webhook reads ownership out of it — a client-chosen path under
   * invoices/ could be attributed to another user.
   */
  const upload = async (file: File) => {
    setUploading(true)
    try {
      const { url } = await storageApi.getInvoiceUploadUrl(file.name)

      const put = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)

      toast('Uploaded — extraction starting', 'success')
      // The webhook registers the row; give it a beat, then refresh.
      setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: ['documents'] }),
        1200,
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const items = documents.data?.items ?? []

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Uploads are extracted automatically using your default format."
        action={
          <>
            <input
              ref={fileInput}
              id="document-upload"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void upload(file)
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={15} />
              {uploading ? 'Uploading…' : 'Upload invoice'}
            </Button>
          </>
        }
      />

      <Card>
        {documents.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : documents.isError ? (
          <ErrorState
            message={
              documents.error instanceof Error
                ? documents.error.message
                : 'Could not load documents'
            }
            onRetry={() => void documents.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Files}
            title="No documents yet"
            description="Upload a PDF or image of an invoice. Extraction runs automatically and the result appears here."
            action={
              <Button onClick={() => fileInput.current?.click()}>
                <Upload size={15} />
                Upload invoice
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-5 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Buyer</th>
                  <th className="px-4 py-2.5 font-medium">Invoice no.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    invoice={byDocument.get(doc.id)}
                    onPreview={() => setPreview(doc)}
                    onRetry={() => retry.mutate(doc.id)}
                    onDelete={() => remove.mutate(doc.id)}
                    busy={retry.isPending || remove.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {preview ? (
        <DocumentPreview
          documentId={preview.id}
          title={preview.summary}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  )
}

/** Reads the buyer out of the per-format JSONB, where it has no core column. */
const buyerName = (invoice?: Invoice): string | null => {
  const buyer = invoice?.data?.buyer
  if (typeof buyer === 'string') return buyer
  if (buyer && typeof buyer === 'object' && 'name' in buyer) {
    const n = (buyer as { name?: unknown }).name
    return typeof n === 'string' && n !== 'null' ? n : null
  }
  return null
}

function DocumentRow({
  doc,
  invoice,
  onPreview,
  onRetry,
  onDelete,
  busy,
}: {
  doc: Document
  invoice?: Invoice
  onPreview: () => void
  onRetry: () => void
  onDelete: () => void
  busy: boolean
}) {
  const pending = doc.status === 'pending' || doc.status === 'processing'

  return (
    <>
      <tr className="transition-colors hover:bg-surface-alt">
        <td className="px-5 py-3">
          {invoice?.vendorName ? (
            <span className="font-medium">{invoice.vendorName}</span>
          ) : (
            <span className="text-ink-subtle">
              {pending ? 'Extracting…' : '—'}
            </span>
          )}
          <div className="text-xs text-ink-subtle">{shortDate(doc.createdAt)}</div>
        </td>

        <td className="px-4 py-3 text-ink-muted">{buyerName(invoice) ?? '—'}</td>

        <td className="px-4 py-3">
          {invoice ? (
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: invoice.id }}
              className="font-medium text-brand hover:underline"
            >
              {invoice.invoiceNumber ?? 'Untitled'}
            </Link>
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </td>

        <td className="tabular px-4 py-3 text-right font-medium">
          {invoice ? money(invoice.total, invoice.currency) : '—'}
        </td>

        <td className="px-4 py-3">
          <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? 'neutral'}>
            {doc.status}
          </Badge>
        </td>

        <td className="px-5 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={onPreview}>
              <Eye size={13} />
              View
            </Button>
            {doc.status === 'failed' ? (
              <Button size="sm" variant="ghost" onClick={onRetry} disabled={busy}>
                <RotateCw size={13} />
                Retry
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={busy}
              aria-label="Delete document"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </td>
      </tr>

      {/*
        The worker writes the failure reason in plain language. Showing it
        beside Retry is what makes the retry actionable — the user can tell
        whether trying again will help.
      */}
      {doc.status === 'failed' && doc.errorMessage ? (
        <tr>
          <td colSpan={6} className="px-5 pb-3">
            <div className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-xs text-danger">{doc.errorMessage}</p>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
