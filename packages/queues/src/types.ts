export enum QueueNames {
    VIDEO_QUEUE = 'video_queue',
    IMAGE_QUEUE = 'image_queue',
    DOCUMENT_QUEUE = 'document_queue',
}

export type OCRJobData = {
    bucketName: string;
    fileType: string;
    objectPath: string[];
}

/**
 * Invoice extraction job. The webhook has already resolved and validated the
 * owning user and created the documents row, so the worker takes both as
 * given rather than re-parsing the path.
 */
export type DocumentJobData = {
    documentId: string;
    userId: string;
    bucketName: string;
    objectPath: string;
    mimeType: string;
}