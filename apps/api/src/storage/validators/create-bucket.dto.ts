import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const storageBucketSchema = z.object({
    bucketName: z.string().min(1)
})

export type CreateBucketDto = z.infer<typeof storageBucketSchema>
export const storageBucketValidator = zValidator('json', storageBucketSchema)
