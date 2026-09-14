import { z } from 'zod'
import { validate } from 'common'

export const storageObjectSchema = z.object({
    bucketName: z.string().min(1),
    objectName: z.string().min(1)
})

export type StorageObjectDto = z.infer<typeof storageObjectSchema>
export const storageObjectValidator = validate('json', storageObjectSchema)
