import { createWorker, QueueNames, OCRJobData } from "queues"
import MistralService from 'agents'
import { minioService } from '../services/minio.service';

const imageWorker = await createWorker<OCRJobData>(
    QueueNames.IMAGE_QUEUE,
    async (job) => {
        switch (job.name) {
            case 'process_image':
                const { bucketName, objectPath } = job.data;
                console.log('starting processing image', { bucketName, objectPath })
                const mistralService = new MistralService()
                const url = await minioService.getPresignedUrl({ bucketName, objectName: objectPath.join('/'), isFetch: true });
                const ocrResponse = await mistralService.processImageUrl(url);
                const textAnalysis = await Promise.all(ocrResponse?.pages?.map(async (val) => ({
                    analysis: await mistralService.analyzeText(val?.markdown),
                    context: val?.markdown,
                    page: val?.index
                })) || []);
                console.log(textAnalysis, url)
                break;
            default:
                break;
        }
    }
)

console.log('Image Worker started and listening for jobs...')

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing worker...');
    await imageWorker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing worker...');
    await imageWorker.close();
    process.exit(0);
});