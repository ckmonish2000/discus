import { useQuery } from '@tanstack/react-query'
import { X, Download } from 'lucide-react'
import { documentsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'

/**
 * Renders an uploaded document from a short-lived presigned URL.
 *
 * The URL is fetched when the modal opens rather than alongside the list, so
 * viewing one document does not mint a URL for every row. Ownership is
 * checked server-side by /documents/:id/preview.
 */
export function DocumentPreview({
  documentId,
  title,
  onClose,
}: {
  documentId: string
  title?: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['document-preview', documentId],
    queryFn: () => documentsApi.preview(documentId),
    staleTime: 60_000,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Document preview"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold">
            {title || 'Document preview'}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {data ? (
              <a
                href={data.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-brand hover:bg-brand-light"
              >
                <Download size={13} />
                Open in new tab
              </a>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 bg-canvas">
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-ink-muted">
              Loading preview…
            </div>
          ) : isError || !data ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-danger">
              {error instanceof Error ? error.message : 'Could not load preview'}
            </div>
          ) : data.mimeType.startsWith('image/') ? (
            <div className="grid h-full place-items-center overflow-auto p-4">
              <img src={data.url} alt="" className="max-h-full max-w-full" />
            </div>
          ) : (
            <iframe
              src={data.url}
              title="Document preview"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  )
}
