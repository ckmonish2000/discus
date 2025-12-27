import { Mistral } from '@mistralai/mistralai';
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
}