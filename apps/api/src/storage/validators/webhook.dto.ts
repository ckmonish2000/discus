import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

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
