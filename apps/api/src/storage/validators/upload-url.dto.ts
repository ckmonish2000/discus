import { z } from 'zod'
import { validate } from 'common'

export const storageObjectSchema = z.object({
    bucketName: z.string().min(1),
    objectName: z.string().min(1)
})

export type StorageObjectDto = z.infer<typeof storageObjectSchema>
export const storageObjectValidator = validate('json', storageObjectSchema)

export const invoiceUploadSchema = z.object({
    filename: z.string().min(1).max(500),
})

export type InvoiceUploadDto = z.infer<typeof invoiceUploadSchema>
export const invoiceUploadValidator = validate('json', invoiceUploadSchema)
