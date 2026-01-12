import { createQueue, QueueNames } from "queues";

export const imageQueue = createQueue(QueueNames.IMAGE_QUEUE);
export const videoQueue = createQueue(QueueNames.VIDEO_QUEUE);