import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { defaultQueueOptions, defaultWorkerOptions } from './config'
import { QueueNames } from './types';


export const createQueue = (name: QueueNames, options?: Partial<QueueOptions>) => {
    const queue = new Queue(name, {
        ...defaultQueueOptions,
        ...options
    });
    return queue;
}

export const createWorker = async <T>(queueName: QueueNames, processor: (job: Job<T>) => Promise<void>, options?: Partial<WorkerOptions>) => {
    return new Worker(queueName, processor, {
        ...defaultWorkerOptions,
        ...options,
    })
}