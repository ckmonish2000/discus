import { getRedisConnection } from './connection';

const connection = getRedisConnection();

export const defaultQueueOptions = {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            age: 24 * 3600, // Keep completed jobs for 24 hours
            count: 1000,
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
    }
}

export const defaultWorkerOptions = {
    connection,
    concurrency:5,
}