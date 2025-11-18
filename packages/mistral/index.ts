import { Mistral } from '@mistralai/mistralai';
export default class MistralService{
    private mistralClient

    constructor(){
        this.mistralClient = new Mistral({apiKey: process.env.MISTRAL_API_KEY });
    }

    async processImage(){
        const ocrResponse = await this.mistralClient.ocr.process({
            model: "mistral-ocr-latest",
            document: {
                type: "document_url",
                documentUrl: "https://media.geeksforgeeks.org/wp-content/uploads/20210610151625/Hey21.png"
            },
            includeImageBase64: false
        });
        console.log(ocrResponse)
    }
}