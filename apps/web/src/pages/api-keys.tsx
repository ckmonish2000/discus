import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Copy, Check } from 'lucide-react'
import { apiKeysApi, type ApiKeyWithSecret } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader } from '@/components/layout/shell'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<ApiKeyWithSecret | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
  })

  const create = useMutation({
    mutationFn: (keyName: string) => apiKeysApi.create(keyName),
    onSuccess: (key) => {
      setIssued(key)
      setName('')
      setCopied(false)
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not create key', 'error'),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast('Key revoked', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not revoke key', 'error'),
  })

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Copy failed — select the key and copy manually', 'error')
    }
  }

  const keys = data ?? []

  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="Create invoices programmatically with POST /invoices and an X-API-Key header."
      />

      {issued ? (
        <Card className="mb-4 border-success/40 bg-success-bg">
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-success">
              Key created — copy it now
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Only the hash is stored. This is the one time the key is shown.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 text-xs">
                {issued.key}
              </code>
              <Button size="sm" variant="secondary" onClick={() => void copy()}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader title="Create a key" />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate(name.trim())
          }}
          className="flex flex-wrap items-end gap-3 px-5 py-4"
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="key-name"
              className="mb-1 block text-xs font-medium text-ink-muted"
            >
              Name
            </label>
            <input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Billing integration"
              className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create key'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Your keys" />
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load keys'}
            onRetry={() => void refetch()}
          />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys"
            description="Create one above to post invoices from another system."
          />
        ) : (
          <ul className="divide-y divide-line">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="tabular mt-0.5 text-xs text-ink-muted">
                    {key.prefix}··· · created {shortDate(key.createdAt)}
                    {key.lastUsedAt ? ` · last used ${shortDate(key.lastUsedAt)}` : ' · never used'}
                  </p>
                </div>

                {key.revokedAt ? (
                  <Badge tone="danger">Revoked</Badge>
                ) : (
                  <>
                    <Badge tone="success">Active</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke.mutate(key.id)}
                      disabled={revoke.isPending}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
