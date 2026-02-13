import Redis from "ioredis";
import { env } from "common";

let redis: Redis | null = null;

export const getRedisConnection = (): Redis => {
    if (!redis) {
        redis = new Redis({
            host: env.redis.REDIS_HOST,
            port: Number(env.redis.REDIS_PORT),
            password: env.redis.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    }

    redis.on('error', (err) => {
        console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
        console.log('Redis connection established');
    });

    redis.on('end', () => {
        console.log('Redis connection closed');
    });

    return redis;
};

export const closeRedisConnection = () => {
    if (redis) {
        redis.disconnect();
        redis = null;
    }
};