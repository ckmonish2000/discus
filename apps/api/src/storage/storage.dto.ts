import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

// bucket schemas
export const storageBucketSchema = z.object({
    bucketName: z.string().min(1)
})
export type CreateBucketDto = z.infer<typeof storageBucketSchema>
export const storageBucketValidator = zValidator('json', storageBucketSchema)

export type ListBucketDto = z.infer<typeof storageBucketSchema>


// object schemas
export const storageObjectSchema = z.object({
    bucketName: z.string().min(1),
    objectName: z.string().min(1)
})
export type StorageObjectDto = z.infer<typeof storageObjectSchema>
export const storageObjectValidator = zValidator('json', storageObjectSchema)


// webhook schemas
export const storageWebhookSchema = z.object({
    EventName: z.string().min(1),
    Key: z.string().min(1),
    Records: z.array(z.object({
        eventVersion: z.string().min(1),
        eventSource: z.string().min(1),
        awsRegion: z.string().min(1),
        eventTime: z.string().min(1),
        eventName: z.string().min(1),
        userIdentity: z.array(z.object({})),
        requestParameters: z.array(z.object({})),
        responseElements: z.array(z.object({})),
        s3: z.array(z.object({})),
        source: z.array(z.object({})),
    }))
})
export type StorageWebhookDto = z.infer<typeof storageWebhookSchema>
export const storageWebhookValidator = zValidator('json', storageWebhookSchema)
