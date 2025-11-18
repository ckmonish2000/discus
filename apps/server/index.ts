import MistralService from 'mistral'
// import MinioService from "minio";

// const minioService = new MinioService();
// const bucketName = 'test-bucket'
// const objectName = 'random_1.jpeg'
// console.log(await minioService.getPresignedUrl({
//     bucketName,
//     objectName,
//     isFetch:true
// }))

const mistralCLient = new MistralService()
mistralCLient.processImage()