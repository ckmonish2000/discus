import {Hono} from 'hono'
import { storageBucketValidator,storageObjectValidator,storageWebhookValidator,StorageWebhookDto } from './storage.dto'
import { createBucket,generatePresignedUrl,listBuckets,listObjects } from './storage.controllers'

const router = new Hono()

// Buckets
router.get('/bucket', listBuckets)
router.post('/bucket', storageBucketValidator, createBucket)

// Objects - use POST for all since they need request body
router.post('/object', storageObjectValidator, generatePresignedUrl)  // Upload URL (isFetch=false)
router.post('/object/download', storageObjectValidator, generatePresignedUrl)  // Download URL (isFetch=true based on path)

// Files list
router.post('/files', storageBucketValidator, listObjects)

// webhook
router.post('/webhook', storageWebhookValidator, async (c: any) => {
    const body: StorageWebhookDto = await c.req.json()
    console.log(body)
    return c.json({ message: "ok" })      
})
export default router
