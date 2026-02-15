import { Mistral } from "@mistralai/mistralai";
import { Ollama } from "ollama";
import SYSTEM_PROMPT from "./prompts/system.prompt";
import { env, AppError } from "common";

export default class AgentService {
  private mistralClient;

  constructor() {
    this.mistralClient = new Mistral({ apiKey: env.llm.MISTRAL_API_KEY });
  }

  async processImageUrl(documentUrl: string) {
    try {
      const ocrResponse = await this.mistralClient.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl,
        },
        includeImageBase64: false,
      });

      return ocrResponse;
    } catch (err) {
      throw new AppError(
        "mistral failed to process image url",
        500,
        "processImageUrl",
        err,
        { documentUrl },
      );
    }
  }

  async analyzeText(message: string) {
    try {
      let review = "";
      const prompt = SYSTEM_PROMPT + `\n\n` + message;
      const ollama = new Ollama({
        host: env.llm.OLLAMA_HOST || "http://host.docker.internal:11434",
      });

      const response = await ollama.generate({
        model: env.llm.LLM_MODEL || "llama3.2:latest",
        prompt,
        stream: true,
      });

      for await (const chunk of response) {
        review += chunk.response;
      }

      return review;
    } catch (error) {
      throw new AppError(
        "ollama failed to analyze text",
        500,
        "analyzeText",
        error,
        {
          message,
        },
      );
    }
  }
}
