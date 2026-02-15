import ffmpeg from "fluent-ffmpeg";

export const convertVideoToAudio = (inputPath: string, output: string) => {
  return new Promise<void>((resolve, reject) => {
    console.log(`Converting: ${inputPath}`);
    ffmpeg()
      .input(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("pcm_s16le")
      .format("segment")
      .outputOptions(["-segment_time 60", "-reset_timestamps 1"])
      .on("start", (commandLine) => {
        console.log("FFmpeg command:", commandLine);
      })
      .on("end", () => {
        console.log("Chunking done");
        resolve();
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        reject(err);
      })
      .save(`${output}_%03d.wav`);
  });
};