import { Hono } from 'hono';
import { minioService } from '../services/minio.service';
import { storageBucketValidator, CreateBucketDto } from '../validators/create-bucket.dto';

const router = new Hono();

/**
 * POST /bucket
 * Create a new MinIO bucket with the specified name
 */
router.post('/bucket', storageBucketValidator, async (c) => {
    try {
        const { bucketName }: CreateBucketDto = await c.req.json();
        const response = await minioService.createBucket(bucketName);
        return c.json(response);
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
