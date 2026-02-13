import { Mistral } from '@mistralai/mistralai';
import { Ollama } from 'ollama'
import SYSTEM_PROMPT from './prompts/system.prompt';
import { env } from "common";

export default class MistralService {
    private mistralClient

    constructor() {
        this.mistralClient = new Mistral({ apiKey: env.MISTRAL_API_KEY });
    }

    async processImageUrl(documentUrl: string) {
        const ocrResponse = await this.mistralClient.ocr.process({
            model: "mistral-ocr-latest",
            document: {
                type: "document_url",
                documentUrl,
            },
            includeImageBase64: false
        });

        return ocrResponse
    }

    async analyzeText(message: string) {
        let review = ''
        const prompt = SYSTEM_PROMPT + `\n\n` + message
        const ollama = new Ollama({
            host: env.OLLAMA_HOST || 'http://host.docker.internal:11434'
        });

        const response = await ollama.generate({
            model: env.LLM_MODEL || 'llama3.2:latest',
            prompt,
            stream:true
        })

        for await (const chunk of response) {
            review += chunk.response
        }

        return review

    }
}