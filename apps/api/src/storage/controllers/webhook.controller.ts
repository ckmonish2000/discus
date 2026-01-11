import { Hono } from 'hono';
import { minioService } from '../services/minio.service';
import { StorageWebhookDto } from '../validators/webhook.dto';
import MistralService from 'agents'
import { imageQueue, videoQueue } from '../../queues';

const router = new Hono();

/**
 * POST /webhook
 * Handle incoming webhooks from MinIO for bucket events
 */
router.post('/webhook', async (c) => {
    try {
        const { Key: objectName,Records }: StorageWebhookDto = await c.req.json();
        const fileType = String(Records.at(0)?.s3?.object?.["userMetadata"]["content-type"]); 
        const [bucketName, ...objectPath] = objectName.split('/');
        
        if (!bucketName) {
            throw new Error('Bucket name not found');
        }

        if(fileType?.includes('image')) {            
            const obj= await imageQueue.add('analyze_text', {
                fileType: 'image',
                objectPath
            })
        }

        if(fileType?.includes('video')) {            
            const obj= await videoQueue.add('analyze_text', {
                fileType: 'video',
                objectPath
            })
        }
        
        // const mistralService = new MistralService()
        // const url = await minioService.getPresignedUrl({ bucketName, objectName: objectPath.join('/'), isFetch: true });
        // const ocrResponse = await mistralService.processImageUrl(url);
        // const textAnalysis = await Promise.all(ocrResponse?.pages?.map(async (val) => ({
        //     analysis: await mistralService.analyzeText(val?.markdown),
        //     context: val?.markdown,
        //     page: val?.index
        // })) || []);

        // return c.json({ url, textAnalysis })
        return c.json({})
    } catch (error) {
        console.log(error);
        throw error;
    }
});

export default router;
