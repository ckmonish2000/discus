import { Hono } from 'hono';
import { minioService } from '../services/minio.service';
import { StorageWebhookDto } from '../validators/webhook.dto';
import MistralService from 'mistral'
const router = new Hono();

/**
 * POST /webhook
 * Handle incoming webhooks from MinIO for bucket events
 */
router.post('/webhook', async (c) => {
    try {
        const { Key: objectName }: StorageWebhookDto = await c.req.json();
        const [bucketName, ...objectPath] = objectName.split('/');
        if (!bucketName) {
            throw new Error('Bucket name not found');
        }

        const mistralService = new MistralService()
        const url = await minioService.getPresignedUrl({ bucketName, objectName: objectPath.join('/'), isFetch: true });
        const ocrResponse = await mistralService.processImageUrl(url);
        return c.json({ url,ocrResponse });
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
