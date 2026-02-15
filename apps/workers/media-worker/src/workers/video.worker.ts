import { createWorker, QueueNames, OCRJobData } from "queues";
import { minioService } from "../services/minio.service";
import path from "path";

const videoWorker = await createWorker<OCRJobData>(
  QueueNames.VIDEO_QUEUE,
  async (job) => {
    const { fileType, bucketName, objectPath } = job.data;
    const inputDirectory = path.join(__dirname, `../assets/input/`);

    await minioService.saveObjectToLocation(
      bucketName,
      objectPath[0]!,
      inputDirectory,
    );
    
    console.log("received event processing", { fileType, objectPath });
  },
);

console.log("Video Worker started and listening for jobs...");

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing worker...");
  await videoWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing worker...");
  await videoWorker.close();
  process.exit(0);
});
