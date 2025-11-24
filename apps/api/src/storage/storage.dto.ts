import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const storageBucketSchema = z.object({
    bucketName: z.string().min(1)
})
export type CreateBucketDto = z.infer<typeof storageBucketSchema>
export const storageBucketValidator = zValidator('json', storageBucketSchema)

export type ListBucketDto = z.infer<typeof storageBucketSchema>


export const storageObjectSchema = z.object({
    bucketName: z.string().min(1),
    objectName: z.string().min(1)
})
export type StorageObjectDto = z.infer<typeof storageObjectSchema>
export const storageObjectValidator = zValidator('json', storageObjectSchema)
