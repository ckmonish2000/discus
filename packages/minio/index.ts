import * as Minio from "minio";
import { AppError } from "common";
import fs from "fs";
import path from "path";
import { Stream } from "stream";
export default class MinioService {
  private minioClient: Minio.Client;

  constructor(payload: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    useSSL: boolean;
    port?: number;
  }) {
    const url = new URL(payload.endpoint);
    this.minioClient = new Minio.Client({
      endPoint: url.hostname,
      useSSL: payload.useSSL,
      accessKey: payload.accessKey,
      secretKey: payload.secretKey,
      port: payload.port || parseInt(url.port),
    });
  }

  async listBuckets() {
    try {
      return await this.minioClient.listBuckets();
    } catch (error) {
      throw new AppError(
        "failed to list minio buckets",
        500,
        "listBuckets",
        error,
      );
    }
  }

  async bucketExists(bucketName: string) {
    try {
      return await this.minioClient.bucketExists(bucketName);
    } catch (error) {
      throw new AppError(
        "failed to check minio bucket exists",
        500,
        "bucketExists",
        error,
        { bucketName },
      );
    }
  }

  async createBucket(bucketName: string): Promise<{ message: string }> {
    try {
      const bucketExists = await this.bucketExists(bucketName);

      if (bucketExists) {
        return { message: `bucket ${bucketName} already exists` };
      }

      await this.minioClient.makeBucket(bucketName);

      return { message: `bucket ${bucketName} created successfully` };
    } catch (error) {
      throw new AppError(
        "failed to create minio bucket",
        500,
        "createBucket",
        error,
        { bucketName },
      );
    }
  }

  async deleteBucket(bucketName: string) {
    try {
      await this.minioClient.removeBucket(bucketName);
    } catch (error) {
      throw new AppError(
        "failed to delete minio bucket",
        500,
        "deleteBucket",
        error,
        { bucketName },
      );
    }
  }

  async getPresignedUrl(payload: {
    bucketName: string;
    objectName: string;
    isFetch?: boolean;
    expires?: number;
  }) {
    try {
      const { bucketName, objectName, expires, isFetch } = payload;

      if (isFetch) {
        return this.minioClient.presignedGetObject(
          bucketName,
          objectName,
          expires,
        );
      }

      return this.minioClient.presignedPutObject(
        bucketName,
        objectName,
        expires,
      );
    } catch (err) {
      throw new AppError(
        "failed to get presigned url",
        500,
        "getPresignedUrl",
        err,
        { payload },
      );
    }
  }

  async listObjects(bucketName: string) {
    return new Promise((resolve, reject) => {
      const files: any[] = [];
      const stream = this.minioClient.listObjectsV2(
        bucketName,
        undefined,
        true,
      );

      stream.on("data", (obj) => files.push(obj));
      stream.on("end", () => resolve(files));
      stream.on("error", reject);
    });
  }

  async saveObjectToLocation(
    bucketName: string,
    objectName: string,
    location: string,
  ) {
    try {
      if (!fs.existsSync(location)) {
        fs.mkdirSync(location, { recursive: true });
      }
      const fileName = path.basename(objectName);
      const filePath = path.join(location, fileName);
      const stream = await this.minioClient.getObject(bucketName, objectName);
      await this.writeStreamToPath(stream, filePath);
      return filePath;
    } catch (error) {
      throw new AppError(
        "Failed to save object to location",
        500,
        "saveObjectToLocation",
        error,
        { bucketName, objectName, location },
      );
    }
  }

  async writeStreamToPath(stream: Stream.Readable, filePath: string) {
    return new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(filePath);
      stream.pipe(fileStream);
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
      stream.on("error", reject);
    });
  }
}
