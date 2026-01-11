export enum QueueNames {
    VIDEO_QUEUE = 'video_queue',
    IMAGE_QUEUE = 'image_queue',
    OCR_QUEUE = 'ocr_queue'
}

export type OCRJobData = {
    fileType: string;
    objectPath: string[];
}