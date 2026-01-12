import './workers/image.worker'
import './workers/video.worker'
// import ffmpeg from "fluent-ffmpeg";
// import path from "path";

// const videoFileUrl = path.join(__dirname, "input", "video.mp4");
// const outputPath = path.join(__dirname, "output", "audio.wav");

// const convertVideoToAudio = (inputPath: string, output: string) => {
//     return new Promise<void>((resolve, reject) => {
//         console.log(`Converting: ${inputPath}`);
//         ffmpeg(inputPath)
//             .audioChannels(1)
//             .audioFrequency(16000)
//             .audioCodec("pcm_s16le")
//             .format("wav")
//             .on("start", (commandLine: any) => {
//                 console.log("FFmpeg command:", commandLine);
//             })
//             .on("progress", (progress: any) => {
//                 console.log(`Processing: ${progress.timemark}`);
//             })
//             .on("end", () => {
//                 console.log("Conversion done");
//                 resolve();
//             })
//             .on("error", (err: any) => {
//                 console.error("FFmpeg error:", err);
//                 reject(err);
//             })
//             .save(output);
//     });
// };
