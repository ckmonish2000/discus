import { Hono } from 'hono';
import { storageWebhookValidator, StorageWebhookDto } from '../validators/webhook.dto';

const router = new Hono();

/**
 * POST /webhook
 * Handle incoming webhooks from MinIO for bucket events
 */
router.post('/webhook', storageWebhookValidator, async (c) => {
    try {
        const body: StorageWebhookDto = await c.req.json();
        console.log(body);
        return c.json({ message: "ok" });
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
