import { Hono } from 'hono';
import { minioService } from '../services/minio.service';
import { storageBucketValidator, ListBucketDto } from '../validators/list-objects.dto';

const router = new Hono();

/**
 * POST /files
 * List all objects in a specified MinIO bucket
 */
router.post('/files', storageBucketValidator, async (c) => {
    try {
        const { bucketName }: ListBucketDto = await c.req.json();
        const response = await minioService.listObjects(bucketName);
        return c.json(response);
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
