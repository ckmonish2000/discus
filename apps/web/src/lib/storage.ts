import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { storageApi } from './api'

export const storageKeys = {
  all: ['storage'] as const,
  buckets: () => [...storageKeys.all, 'buckets'] as const,
  objects: (bucket: string) => [...storageKeys.all, 'objects', bucket] as const,
}

// List all buckets
export function useListBuckets() {
  return useQuery({
    queryKey: storageKeys.buckets(),
    queryFn: () => storageApi.listBuckets(),
  })
}

// Create a bucket
export function useCreateBucket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bucketName: string) => storageApi.createBucket(bucketName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets() })
    },
  })
}

// List objects in a bucket
export function useListObjects(bucketName: string) {
  return useQuery({
    queryKey: storageKeys.objects(bucketName),
    queryFn: () => storageApi.listObjects(bucketName),
    enabled: !!bucketName,
  })
}

// Get download URL
export function useGetDownloadUrl() {
  return useMutation({
    mutationFn: ({ bucketName, objectName }: { bucketName: string; objectName: string }) =>
      storageApi.getDownloadUrl(bucketName, objectName),
  })
}

// Get upload URL
export function useGetUploadUrl() {
  return useMutation({
    mutationFn: ({ bucketName, objectName }: { bucketName: string; objectName: string }) =>
      storageApi.getUploadUrl(bucketName, objectName),
  })
}

// Upload file (gets presigned URL then uploads)
export function useUploadFile(bucketName: string) {
  const queryClient = useQueryClient()
  const getUploadUrl = useGetUploadUrl()

  return useMutation({
    mutationFn: async (file: File) => {
      // Get presigned upload URL - response is {url: string}
      const { url } = await getUploadUrl.mutateAsync({
        bucketName,
        objectName: file.name,
      })

      if (!url) {
        throw new Error('Failed to get upload URL')
      }

      // Upload file to presigned URL
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      return { name: file.name }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketName) })
    },
  })
}
