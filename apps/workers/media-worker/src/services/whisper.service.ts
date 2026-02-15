import path from "path";
import { spawn } from "child_process";
import fs from "fs";

const transcribeAudio = async (audioPath: string, outputDir: string, options: {
    model?: "tiny" | "base" | "small" | "medium" | "large";
    language?: string;
    outputFormat?: "txt" | "vtt" | "srt" | "json" | "all";
} = {}) => {
    const {
        model = "base",
        language = "en",
        outputFormat = "txt"
    } = options

    return new Promise<{ success: boolean; outputPath: string; error?: string }>((resolve, reject) => {
        const whisperPath = "/opt/whisper-venv/bin/whisper";

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const args = [
            audioPath,
            "--model", model,
            "--language", language,
            "--output_dir", outputDir,
            "--output_format", outputFormat
        ];

        console.log(`Starting transcription with Whisper...`);
        console.log(`Command: ${whisperPath} ${args.join(" ")}`);


        const whisperProcess = spawn(whisperPath, args);

        let stdout = "";
        let stderr = "";

        whisperProcess.stdout.on("data", (data: Buffer) => {
            const output = data.toString();
            stdout += output;
            console.log(output);
        });

        whisperProcess.stderr.on("data", (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            console.error(output);
        });

        whisperProcess.on("close", (code: number) => {
            console.log(`Whisper process exited with code: ${code}`);

            if (code === 0) {
                // Determine output filename
                const audioFileName = path.basename(audioPath, path.extname(audioPath));
                const outputFileName = `${audioFileName}.${outputFormat}`;
                const outputPath = path.join(outputDir, outputFileName);

                resolve({
                    success: true,
                    outputPath
                });
            } else {
                reject({
                    success: false,
                    outputPath: "",
                    error: `Whisper failed with code ${code}: ${stderr}`
                });
            }
        });

        whisperProcess.on("error", (err: Error) => {
            console.error("Whisper process error:", err);
            reject({
                success: false,
                outputPath: "",
                error: err.message
            });
        });
    });
}

export { transcribeAudio };
