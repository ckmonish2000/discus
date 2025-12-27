import { Hono } from 'hono'

// Import individual controller modules
import listBucketsRouter from './controllers/list-buckets.controller'
import createBucketRouter from './controllers/create-bucket.controller'
import uploadUrlRouter from './controllers/upload-url.controller'
import downloadUrlRouter from './controllers/download-url.controller'
import listObjectsRouter from './controllers/list-objects.controller'
import webhookRouter from './controllers/webhook.controller'

/**
 * Main storage controller that composes all storage-related controllers.
 * Each controller is defined in its own file with co-located handler logic.
 */
const router = new Hono()

// Compose all storage routes
router.route('/', listBucketsRouter)
router.route('/', createBucketRouter)
router.route('/', uploadUrlRouter)
router.route('/', downloadUrlRouter)
router.route('/', listObjectsRouter)
router.route('/', webhookRouter)

export default router
