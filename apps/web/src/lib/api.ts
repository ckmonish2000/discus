const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type ApiResponse<T> = { success: true; data: T }
type ApiErrorResponse = { success: false; message: string; status: number }

export type Paginated<T> = {
  items: T[]
  pagination: { total: number; limit: number; offset: number; hasMore: boolean }
}

/**
 * Every call sends cookies: the session lives in httpOnly cookies the browser
 * will not attach unless credentials are explicitly included.
 */
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })

  // 204 and empty bodies would throw on .json().
  const text = await response.text()
  const json = (text ? JSON.parse(text) : { success: response.ok }) as
    | ApiResponse<T>
    | ApiErrorResponse

  if (!response.ok || !json.success) {
    const error = json as ApiErrorResponse
    throw Object.assign(
      new Error(error.message || `Request failed (${response.status})`),
      { status: response.status },
    )
  }

  return (json as ApiResponse<T>).data
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

// ---------------------------------------------------------------- types

export type User = { id: string; email: string; name: string | null }

export type Document = {
  id: string
  bucketName: string
  objectPath: string
  mimeType: string
  sizeBytes: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  summary: string | null
  errorMessage: string | null
  processedAt: string | null
  createdAt: string
}

export type InvoiceStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'void'

export type Invoice = {
  id: string
  vendorId: string | null
  documentId: string | null
  invoiceNumber: string | null
  poNumber: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number | null
  taxTotal: number | null
  discount: number | null
  total: number | null
  status: InvoiceStatus
  paymentTerms: string | null
  source: 'extraction' | 'api' | 'dashboard'
  confidence: number | null
  needsReview: boolean
  data: Record<string, unknown>
  createdAt: string
  /** Joined from the vendors table by the list endpoint. */
  vendorName?: string | null
}

export type LineItem = {
  id: string
  position: number
  description: string | null
  quantity: number | null
  unitPrice: number | null
  lineTotal: number | null
  taxRate: number | null
}

export type InvoiceDetail = Invoice & { lineItems: LineItem[] }

export type Vendor = {
  id: string
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  address: Record<string, unknown> | null
  createdAt: string
}

export type InvoiceFormat = {
  id: string
  name: string
  description: string | null
  schema: Record<string, unknown>
  fieldMapping: Record<string, string | null>
  isDefault: boolean
  createdAt: string
}

export type ApiKey = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Only ever returned once, at creation. */
export type ApiKeyWithSecret = ApiKey & { key: string }

// ---------------------------------------------------------------- endpoints

export const authApi = {
  me: () => request<{ user: User }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string, name?: string) =>
    request<{ user: User }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
    }),
  logout: () => request<unknown>('/auth/logout', { method: 'POST' }),
}

export type InvoiceFilters = {
  status?: string
  vendorId?: string
  needsReview?: string
  issuedAfter?: string
  issuedBefore?: string
  limit?: number
  offset?: number
}

export const invoicesApi = {
  list: (filters: InvoiceFilters = {}) =>
    request<Paginated<Invoice>>(`/invoices${qs(filters)}`),
  get: (id: string) => request<InvoiceDetail>(`/invoices/${id}`),
  update: (id: string, body: Partial<Invoice>) =>
    request<Invoice>(`/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<{ deleted: boolean }>(`/invoices/${id}`, { method: 'DELETE' }),
}

export const documentsApi = {
  list: (params: { search?: string; status?: string; limit?: number; offset?: number } = {}) =>
    request<Paginated<Document>>(`/documents${qs(params)}`),
  get: (id: string) => request<Document>(`/documents/${id}`),
  register: (body: {
    bucketName: string
    objectPath: string
    mimeType: string
    sizeBytes?: number
  }) =>
    request<Document>('/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  retry: (id: string) =>
    request<Document>(`/documents/${id}/retry`, { method: 'POST' }),
  /** Short-lived URL for the original file; ownership is checked server-side. */
  preview: (id: string) =>
    request<{ url: string; mimeType: string }>(`/documents/${id}/preview`),
  remove: (id: string) =>
    request<{ deleted: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
}

export const vendorsApi = {
  list: (params: { search?: string; limit?: number; offset?: number } = {}) =>
    request<Paginated<Vendor>>(`/vendors${qs(params)}`),
}

export const formatsApi = {
  list: () => request<InvoiceFormat[]>('/formats'),
  template: () => request<Omit<InvoiceFormat, 'id' | 'isDefault' | 'createdAt'>>('/formats/template'),
  create: (body: {
    name: string
    description?: string
    schema: Record<string, unknown>
    fieldMapping: Record<string, string | null>
    isDefault?: boolean
  }) => request<InvoiceFormat>('/formats', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    request<InvoiceFormat>(`/formats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<{ deleted: boolean }>(`/formats/${id}`, { method: 'DELETE' }),
}

export const apiKeysApi = {
  list: () => request<ApiKey[]>('/api-keys'),
  create: (name: string) =>
    request<ApiKeyWithSecret>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revoke: (id: string) =>
    request<ApiKey>(`/api-keys/${id}`, { method: 'DELETE' }),
}

export const storageApi = {
  /**
   * Invoice uploads have their own endpoint. Only the filename is sent: the
   * server derives the object path from the session, because the MinIO
   * webhook treats the `invoices/<userId>/` prefix as proof of ownership.
   * A client-supplied path there would let anyone forge an upload attributed
   * to another user, so /storage/object rejects that prefix outright.
   */
  getInvoiceUploadUrl: (filename: string) =>
    request<{ url: string; objectPath: string }>('/storage/invoice-upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),

  getUploadUrl: (bucketName: string, objectName: string) =>
    request<{ url: string }>('/storage/object', {
      method: 'POST',
      body: JSON.stringify({ bucketName, objectName }),
    }),
  getDownloadUrl: (bucketName: string, objectName: string) =>
    request<{ url: string }>('/storage/object/download', {
      method: 'POST',
      body: JSON.stringify({ bucketName, objectName }),
    }),
}
