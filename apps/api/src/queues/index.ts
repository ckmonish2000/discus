import { createQueue, QueueNames } from "queues";

export const ocrQueue = createQueue(QueueNames.OCR_QUEUE);