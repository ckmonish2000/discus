export enum QueueNames {
    VIDEO_QUEUE = 'video_queue',
    IMAGE_QUEUE = 'image_queue',
}

export type OCRJobData = {
    fileType: string;
    objectPath: string[];
}