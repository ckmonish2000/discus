import { z } from 'zod'
import { validate } from 'common'

export const storageBucketSchema = z.object({
    bucketName: z.string().min(1)
})

export type CreateBucketDto = z.infer<typeof storageBucketSchema>
export const storageBucketValidator = validate('json', storageBucketSchema)
