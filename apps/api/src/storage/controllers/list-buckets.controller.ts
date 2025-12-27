import { Hono } from 'hono';
import { minioService } from '../services/minio.service';

const router = new Hono();

/**
 * GET /bucket
 * List all available MinIO buckets
 */
router.get('/bucket', async (c) => {
    try {
        const response = await minioService.listBuckets();
        return c.json(response);
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
