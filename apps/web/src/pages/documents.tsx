import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Upload, Files, RotateCw, AlertTriangle, Trash2 } from 'lucide-react'
import { documentsApi, storageApi, type Document } from '@/lib/api'
import { fileSize, fileName, shortDate } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { PageHeader } from '@/components/layout/shell'
import { Card } from '@/components/ui/card'
import { Badge, DOCUMENT_STATUS_TONE } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

const BUCKET = 'invoices'

export function DocumentsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  /**
   * Polls while anything is mid-extraction. The worker writes status changes
   * straight to Postgres, so the dashboard has no push channel — a short
   * interval is how a finished extraction appears without a manual refresh.
   */
  const { data, isLoading, isError, error, refetch } = useQuery({
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
      toast('Document deleted', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Delete failed', 'error'),
  })

  /**
   * Upload goes straight to MinIO with a presigned URL; the storage webhook
   * then registers the document and enqueues extraction. The browser never
   * proxies file bytes through the API.
   */
  const upload = async (file: File) => {
    if (!user) return
    setUploading(true)
    try {
      const objectPath = `invoices/${user.id}/${Date.now()}-${file.name}`
      const { url } = await storageApi.getUploadUrl(BUCKET, objectPath)

      const put = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)

      toast('Uploaded — extraction starting', 'success')
      // The webhook registers the row; give it a beat, then refresh.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['documents'] }), 1200)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const items = data?.items ?? []

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
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              <Upload size={15} />
              {uploading ? 'Uploading…' : 'Upload invoice'}
            </Button>
          </>
        }
      />

      <Card>
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load documents'}
            onRetry={() => void refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Files}
            title="No documents yet"
            description="Upload a PDF or image of an invoice. Extraction runs automatically and the result appears under Invoices."
            action={
              <Button onClick={() => fileInput.current?.click()}>
                <Upload size={15} />
                Upload invoice
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onRetry={() => retry.mutate(doc.id)}
                onDelete={() => remove.mutate(doc.id)}
                busy={retry.isPending || remove.isPending}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function DocumentRow({
  doc,
  onRetry,
  onDelete,
  busy,
}: {
  doc: Document
  onRetry: () => void
  onDelete: () => void
  busy: boolean
}) {
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fileName(doc.objectPath)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {fileSize(doc.sizeBytes)} · {shortDate(doc.createdAt)}
          </p>
        </div>

        <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? 'neutral'}>
          {doc.status}
        </Badge>

        {doc.status === 'failed' ? (
          <Button size="sm" variant="secondary" onClick={onRetry} disabled={busy}>
            <RotateCw size={13} />
            Retry
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} aria-label="Delete document">
          <Trash2 size={14} />
        </Button>
      </div>

      {doc.summary ? (
        <p className="mt-2 text-sm text-ink-muted">{doc.summary}</p>
      ) : null}

      {/*
        The worker writes the failure reason here in plain language. Showing
        it beside the Retry button is what makes the retry actionable — the
        user can tell whether trying again will help.
      */}
      {doc.status === 'failed' && doc.errorMessage ? (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-xs text-danger">{doc.errorMessage}</p>
        </div>
      ) : null}
    </li>
  )
}
