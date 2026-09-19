import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal, Check } from 'lucide-react'
import { formatsApi } from '@/lib/api'
import { PageHeader } from '@/components/layout/shell'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

export function FormatsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['formats'],
    queryFn: () => formatsApi.list(),
  })

  const makeDefault = useMutation({
    mutationFn: (id: string) => formatsApi.update(id, { isDefault: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['formats'] })
      toast('Default format updated', 'success')
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Update failed', 'error'),
  })

  const formats = data ?? []

  return (
    <>
      <PageHeader
        title="Invoice formats"
        subtitle="The default format defines what the model extracts and where each field is stored."
      />

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
        </div>
      ) : isError ? (
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load formats'}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : formats.length === 0 ? (
        <Card>
          <EmptyState
            icon={SlidersHorizontal}
            title="No formats"
            description="Your account should have the standard EN 16931 format. Contact support if this persists."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {formats.map((format) => {
            const mapped = Object.entries(format.fieldMapping ?? {}).filter(
              ([, v]) => v !== null,
            )

            return (
              <Card key={format.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {format.name}
                      {format.isDefault ? (
                        <Badge tone="success">
                          <Check size={11} />
                          Default
                        </Badge>
                      ) : null}
                    </span>
                  }
                  subtitle={format.description ?? undefined}
                  action={
                    format.isDefault ? null : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => makeDefault.mutate(format.id)}
                        disabled={makeDefault.isPending}
                      >
                        Make default
                      </Button>
                    )
                  }
                />

                <div className="px-5 py-4">
                  <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Field mapping · {mapped.length} mapped
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {mapped.slice(0, 14).map(([from, to]) => (
                      <span
                        key={from}
                        className="rounded border border-line bg-surface-alt px-2 py-1 text-xs"
                      >
                        <span className="text-ink-muted">{from}</span>
                        <span className="mx-1 text-ink-subtle">→</span>
                        <span className="font-medium">{to}</span>
                      </span>
                    ))}
                    {mapped.length > 14 ? (
                      <span className="px-2 py-1 text-xs text-ink-subtle">
                        +{mapped.length - 14} more
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
