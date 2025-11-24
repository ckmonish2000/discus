const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`)
  }

  return response.json()
}

export type Bucket = {
  name: string
  creationDate: string
}

export type StorageObject = {
  name: string
  size: number
  lastModified: string
}

export type PresignedUrlResponse = {
  url: string
}

// Storage API
export const storageApi = {
  // GET /storage/bucket - List all buckets
  listBuckets: () =>
    request<Bucket[]>('/storage/bucket', {
      method: 'GET',
    }),

  // POST /storage/bucket - Create a bucket
  createBucket: (bucketName: string) =>
    request<{ message: string }>('/storage/bucket', {
      method: 'POST',
      body: JSON.stringify({ bucketName }),
    }),

  // POST /storage/files - List objects in a bucket
  listObjects: (bucketName: string) =>
    request<StorageObject[]>('/storage/files', {
      method: 'POST',
      body: JSON.stringify({ bucketName }),
    }),

  // POST /storage/object/download - Get presigned URL for download
  getDownloadUrl: (bucketName: string, objectName: string) =>
    request<PresignedUrlResponse>('/storage/object/download', {
      method: 'POST',
      body: JSON.stringify({ bucketName, objectName }),
    }),

  // POST /storage/object - Get presigned URL for upload
  getUploadUrl: (bucketName: string, objectName: string) =>
    request<PresignedUrlResponse>('/storage/object', {
      method: 'POST',
      body: JSON.stringify({ bucketName, objectName }),
    }),
}
