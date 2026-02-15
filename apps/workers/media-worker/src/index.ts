import './workers/image.worker'
import './workers/video.worker'
// import ffmpeg from "fluent-ffmpeg";
// import path from "path";
// import fs from "fs";
// import { transcribeAudio } from "./services/whisper.service";

// const videoFileUrl = path.join(__dirname, "assets", "input", "video.mp4");
// const outputBase = `audio_${Math.random().toString(36).substring(2, 9)}`
// const outputPath = path.join(__dirname, "assets", "output", `${outputBase}`);

// const convertVideoToAudio = (inputPath: string, output: string) => {
//     return new Promise<void>((resolve, reject) => {
//         console.log(`Converting: ${inputPath}`);
//         ffmpeg()
//             .input(inputPath)
//             .audioChannels(1)
//             .audioFrequency(16000)
//             .audioCodec("pcm_s16le")
//             .format("segment")
//             .outputOptions([
//                 "-segment_time 60",
//                 "-reset_timestamps 1"
//             ])
//             .on("start", (commandLine) => {
//                 console.log("FFmpeg command:", commandLine);
//             })
//             .on("end", () => {
//                 console.log("Chunking done");
//                 resolve();
//             })
//             .on("error", (err) => {
//                 console.error("FFmpeg error:", err);
//                 reject(err);
//             })
//             .save(`${output}_%03d.wav`);
//     });
// };

// // Example 1: Using file path (direct processing)
// convertVideoToAudio(videoFileUrl, outputPath).then(() => {
//     console.log('Conversion done');
//     // process.exit(0);
// }).catch((err) => {
//     console.error('Conversion failed', err);
//     // process.exit(1);
// });

// // // Example usage
// const main = async () => {
//     try {
//         console.log('========\n\n\n')
//         const outputDir = outputPath.split('/').splice(0, outputPath.split('/').length - 1).join('/')
//         fs.readdir(outputDir, async (err, files) => {
//             if (err) {
//                 console.error("Error reading directory:", err);
//                 return;
//             }

//             for (const [index, file] of files.entries()) {
//                 const audioPath = path.join(outputDir, file);
//                 console.log(`=== Starting Transcription ${index} ===`);
//                 const result = await transcribeAudio(audioPath, outputDir, {
//                     model: "tiny",
//                     language: "en",
//                     outputFormat: "txt"
//                 });
//                 console.log(`=== Transcription Complete ${index} ===`);

//                 if (fs.existsSync(result.outputPath)) {
//                     const transcription = fs.readFileSync(result.outputPath, "utf-8");
//                     console.log("\n=== Transcription Content ===");
//                     console.log(transcription);
//                 }
//             }
//         });
//     } catch (error: any) {
//         console.error("Transcription failed:", error);
//     }
// }

// // // Uncomment to run the example
// // main();
