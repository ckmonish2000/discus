import { useState, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  useListBuckets,
  useCreateBucket,
  useListObjects,
  useUploadFile,
  useGetDownloadUrl,
} from '@/lib/storage'
import { FolderPlus, Upload, FileText, Link as LinkIcon, Loader2, Database } from 'lucide-react'

export function StoragePage() {
  const [activeBucket, setActiveBucket] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const listBuckets = useListBuckets()
  const createBucket = useCreateBucket()
  const listObjects = useListObjects(activeBucket)
  const uploadFile = useUploadFile(activeBucket)
  const getDownloadUrl = useGetDownloadUrl()

  const bucketForm = useForm({
    defaultValues: { bucketName: '' },
    onSubmit: async ({ value }) => {
      if (!value.bucketName.trim()) return
      try {
        await createBucket.mutateAsync(value.bucketName)
        setActiveBucket(value.bucketName)
        bucketForm.reset()
        toast(`Bucket "${value.bucketName}" created successfully`, 'success')
      } catch {
        toast('Failed to create bucket', 'error')
      }
    },
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && activeBucket) {
      try {
        await uploadFile.mutateAsync(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
        toast(`"${file.name}" uploaded successfully`, 'success')
      } catch {
        toast('Failed to upload file', 'error')
      }
    }
  }

  const handleGetUrl = async (objectName: string) => {
    const { url } = await getDownloadUrl.mutateAsync({
      bucketName: activeBucket,
      objectName,
    })
    if (url) {
      window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Storage</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Buckets List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Buckets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listBuckets.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading buckets...
              </div>
            ) : listBuckets.isError ? (
              <p className="text-sm text-destructive">{listBuckets.error.message}</p>
            ) : listBuckets.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No buckets yet</p>
            ) : (
              <div className="space-y-2">
                {listBuckets.data?.map((bucket) => (
                  <button
                    key={bucket.name}
                    onClick={() => setActiveBucket(bucket.name)}
                    className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-secondary ${
                      activeBucket === bucket.name ? 'border-primary bg-secondary' : ''
                    }`}
                  >
                    <p className="font-medium">{bucket.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(bucket.creationDate).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Bucket */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Create Bucket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                bucketForm.handleSubmit()
              }}
              className="flex gap-2"
            >
              <bucketForm.Field name="bucketName">
                {(field) => (
                  <Input
                    placeholder="bucket-name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                )}
              </bucketForm.Field>
              <Button type="submit" disabled={createBucket.isPending}>
                {createBucket.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Create'
                )}
              </Button>
            </form>
            {createBucket.isError && (
              <p className="mt-2 text-sm text-destructive">
                {createBucket.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload File */}
      {activeBucket && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload to "{activeBucket}"
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                disabled={uploadFile.isPending}
              />
              {uploadFile.isPending && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
            {uploadFile.isError && (
              <p className="mt-2 text-sm text-destructive">
                {uploadFile.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Files List */}
      {activeBucket && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Files in "{activeBucket}"
            </CardTitle>
          </CardHeader>
          <CardContent>
            {listObjects.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading files...
              </div>
            ) : listObjects.isError ? (
              <p className="text-sm text-destructive">{listObjects.error.message}</p>
            ) : listObjects.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files in this bucket</p>
            ) : (
              <div className="divide-y">
                {listObjects.data?.map((obj) => (
                  <div
                    key={obj.name}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="font-medium">{obj.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBytes(obj.size)} | {new Date(obj.lastModified).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleGetUrl(obj.name)}
                      disabled={getDownloadUrl.isPending}
                    >
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Get URL
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
