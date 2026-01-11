import { createWorker, QueueNames, OCRJobData } from "queues"

const imageWorker = await createWorker<OCRJobData>(
    QueueNames.IMAGE_QUEUE,
    async (job) => {
        const { fileType, objectPath } = job.data;
        console.log('received event processing',{fileType, objectPath})
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