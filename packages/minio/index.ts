import * as Minio from 'minio'

export default class MinioService {
    private minioClient: Minio.Client;

    constructor() {
        const url = new URL(process.env.MINIO_BASE_URL!);
        this.minioClient = new Minio.Client({
            endPoint: url.hostname,
            port: parseInt(url.port),
            useSSL: url.protocol === 'https:',
            accessKey: process.env.MINIO_ACCESS_KEY!,
            secretKey: process.env.MINIO_SECRET_KEY!
        });
    }

    async listBuckets() {
        try {
            return await this.minioClient.listBuckets();
        } catch (error) {
            console.log(error);
        }
    }

    async createBucket(bucketName: string) {
        try {
            return await this.minioClient.makeBucket(bucketName)
        } catch (error) {
            console.log(error);
        }
    }

    async deleteBucket(bucketName: string) {
        try {
            await this.minioClient.removeBucket(bucketName)
        } catch (error) {
            console.log(error);
        }
    }

    async getPresignedUrl(payload: { bucketName: string, objectName: string, isFetch?:boolean,expires?: number }) {
        try {
            const { bucketName, objectName, expires,isFetch } = payload

            if(isFetch){
                return this.minioClient.presignedGetObject(
                    bucketName,
                    objectName,
                    expires
                )
            }

            return this.minioClient.presignedPutObject(
                bucketName,
                objectName,
                expires
            )
        } catch (err) {
            console.log(err)
        }
    }


}