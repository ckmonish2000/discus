import { Mistral } from '@mistralai/mistralai';
import SYSTEM_PROMPT from './prompts/system.prompt';
export default class MistralService {
    private mistralClient

    constructor() {
        this.mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
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
        const prompt = SYSTEM_PROMPT + `\n\n` + message

        const textAnalysis = await fetch('http://host.docker.internal:12434/engines/llama.cpp/v1/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "stream": false,
                "model": process.env.LLM_MODEL,
                "prompt": prompt
            }),
        })

        const data = await textAnalysis.json() as any;
        console.log(data)
        return data.choices;
    }

    async streamAnalyzeText(message: string) {
        const prompt = SYSTEM_PROMPT + `\n\n` + message

        const textAnalysis = await fetch('http://host.docker.internal:12434/engines/llama.cpp/v1/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "stream": true,
                "model": process.env.LLM_MODEL,
                "prompt": prompt
            }),
        })

        return textAnalysis.body;
    }
}