import { createWorker, QueueNames, OCRJobData } from "queues";
import { minioService } from "../services/minio.service";
import path from "path";
import AgentService from "agents";
import fs from "fs";
import { randomUUID } from "crypto";
import { convertVideoToAudio } from "../services/ffmpeg.service";
import { transcribeAudio } from "../services/whisper.service";
const hashMap: Record<string, any> = {};

const videoWorker = await createWorker<OCRJobData>(
  QueueNames.VIDEO_QUEUE,
  async (job) => {
    const { fileType, bucketName, objectPath } = job.data;
    const agentService = new AgentService();
    const inputDirectory = path.join(__dirname, `../assets/input/`);

    if (hashMap[objectPath.join("/")] > new Date().getTime()) {
      return;
    }

    hashMap[objectPath.join("/")] = new Date().getTime() + 60; // 60 seconds

    const filePath = await minioService.saveObjectToLocation(
      bucketName,
      objectPath[0]!,
      inputDirectory,
    );

    // Scoped output directories for this job
    const jobId = randomUUID();
    const jobDirectory = path.join(__dirname, `../assets/output/${jobId}`);
    const audioDirectory = path.join(jobDirectory, "audio");
    const transcriptsDirectory = path.join(jobDirectory, "transcripts");

    await fs.promises.mkdir(audioDirectory, { recursive: true });
    await fs.promises.mkdir(transcriptsDirectory, { recursive: true });

    // ffmpeg writes chunk files into audioDirectory
    await convertVideoToAudio(filePath, path.join(audioDirectory, "chunk"));

    const allFiles = await fs.promises.readdir(audioDirectory);
    const chunkFiles = allFiles.filter((f) => f.endsWith(".wav")).sort();

    let fullTranscription = "";

    for (const [index, file] of chunkFiles.entries()) {
      const audioPath = path.join(audioDirectory, file);
      console.log(
        `=== Starting Transcription ${index + 1}/${chunkFiles.length} ===`,
      );

      const result = await transcribeAudio(audioPath, transcriptsDirectory, {
        model: "tiny",
        language: "en",
        outputFormat: "txt",
      });

      console.log(
        `=== Transcription Complete ${index + 1}/${chunkFiles.length} ===`,
      );

      const exists = await fs.promises.access(result.outputPath).then(() => true).catch(() => false);
      if (exists) {
        const chunkText = (await fs.promises.readFile(result.outputPath, "utf-8")).trim();
        fullTranscription += (fullTranscription ? "\n" : "") + chunkText;
      }
    }

    // Read transcript files in order from transcriptsDirectory and generate textAnalysis
    const allTranscriptFiles = await fs.promises.readdir(transcriptsDirectory);
    const orderedTranscripts = allTranscriptFiles
      .filter((f) => f.endsWith(".txt"))
      .sort();

    let assembledTranscript = "";
    for (const transcriptFile of orderedTranscripts) {
      const transcriptPath = path.join(transcriptsDirectory, transcriptFile);
      const content = (await fs.promises.readFile(transcriptPath, "utf-8")).trim();
      if (content) {
        assembledTranscript += (assembledTranscript ? "\n" : "") + content;
      }
    }

    const textAnalysis = {
      totalChunks: orderedTranscripts.length,
      totalCharacters: assembledTranscript.length,
      totalWords: assembledTranscript.split(/\s+/).filter(Boolean).length,
      totalLines: assembledTranscript.split("\n").filter(Boolean).length,
      transcript: assembledTranscript,
    };

    console.log("=== Text Analysis ===");
    console.log(await agentService.analyzeText(textAnalysis.transcript),);

    // Clean up the job working directory (audio chunks + transcripts)
    await fs.promises.rm(jobDirectory, { recursive: true, force: true });
    console.log(`Cleaned up job directory: ${jobDirectory}`);

    console.log("Full transcription:\n", fullTranscription);
    console.log("received event processing", { fileType, objectPath });
  },
);

console.log("Video Worker started and listening for jobs...");

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing worker...");
  await videoWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing worker...");
  await videoWorker.close();
  process.exit(0);
});
