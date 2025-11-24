import { Context } from "hono";
import MinioService from "minio";
import { CreateBucketDto,StorageObjectDto,ListBucketDto } from "./storage.dto";

const minioService = new MinioService({
    useSSL: false,
    endpoint: process.env.MINIO_BASE_URL!,
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
})

export const listBuckets = async (c: Context) => {
    try {
        const response = await minioService.listBuckets()
        return c.json(response)
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const createBucket = async (c: Context) => {
    try {
        const { bucketName }: CreateBucketDto = await c.req.json()
        const response = await minioService.createBucket(bucketName)
        return c.json(response)
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const generatePresignedUrl = async (c: Context) => {
    try {
        // Check if path contains 'download' to determine if fetching or uploading
        const isFetch = c.req.path.includes('/download')
        const { bucketName, objectName }: StorageObjectDto = await c.req.json()
        const response = await minioService.getPresignedUrl({
            bucketName,
            objectName,
            isFetch,
            expires: 60 * 60 * 24 * 7,
        })
        return c.json({url:response})
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const listObjects = async (c: Context) => {
    try {
        const { bucketName }: ListBucketDto = await c.req.json()
        const response = await minioService.listObjects(bucketName)
        return c.json(response)
    } catch (error) {
        console.log(error)
        throw error
    }
}
