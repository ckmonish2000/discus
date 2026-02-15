import { createWorker, QueueNames, OCRJobData } from "queues";
import MistralService from "agents";
import { minioService } from "../services/minio.service";
import { rewriteMinioUrl } from "common";

const hashMap: Record<string, any> = {};
const imageWorker = await createWorker<OCRJobData>(
  QueueNames.IMAGE_QUEUE,
  async (job) => {
    switch (job.name) {
      case "process_image":
        const { bucketName, objectPath } = job.data;

        if (hashMap[objectPath.join("/")] > new Date().getTime()) {
          return;
        }

        hashMap[objectPath.join("/")] = new Date().getTime() + 60; // 60 seconds

        console.log("starting processing image", { bucketName, objectPath });
        const mistralService = new MistralService();

        const url = await minioService.getPresignedUrl({
          bucketName,
          objectName: objectPath.join("/"),
          isFetch: true,
        });
        const publicUrl = rewriteMinioUrl(url);

        const ocrResponse = await mistralService.processImageUrl(publicUrl);

        const textAnalysis = await Promise.all(
          ocrResponse?.pages?.map(async (val) => ({
            analysis: await mistralService.analyzeText(val?.markdown),
            context: val?.markdown,
            page: val?.index,
          })) || [],
        );
        console.log(textAnalysis, url);
        break;
      default:
        break;
    }
  },
);

console.log("Image Worker started and listening for jobs...");

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing worker...");
  await imageWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing worker...");
  await imageWorker.close();
  process.exit(0);
});
