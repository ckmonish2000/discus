# discus

<p align="center">
  <img src="https://github.com/ckmonish2000/discus/blob/main/assets/discus.png" alt="discus Logo" width="250">
</p>

**discus** is a powerful multimodal communication-analysis system designed to evaluate spoken or written language. It generates detailed, actionable notes on improving **tone, diction, clarity, and overall delivery**, making it an essential tool for anyone seeking to elevate their communication skills.

## 💡 Why Use discus?

discus is a powerful tool for **students, professionals, content creators, and public speakers** who want to move beyond simple proofreading. It provides high-level, human-like coaching to help refine the *impact* and *effectiveness* of your message.

## ✨ Features

*   **🎤 Speech-to-Text Processing:**
    *   Upload audio or video files.
    *   **FFmpeg** extracts the audio stream.
    *   **Whisper** produces highly accurate transcription.
*   **🖼️ Image-to-Text Processing:**
    *   Upload images of handwritten or typed text.
    *   **Mistral OCR** extracts text, handling noisy or imperfect images.
*   **🧠 LLM-Based Feedback Generation:**
    *   Extracted text is fed into a **LLaMA** model.
    *   Generates comprehensive feedback including:
        *   Suggestions for improving **tone**.
        *   Notes on **diction and clarity**.
        *   An optional overall communication summary.
*   **🌐 Smooth Modern Workflow:**
    *   Built with a **Bun-based** backend and frontend for fast development and runtime.
    *   Clean upload and processing pipeline.
    *   **Docker support** for easy deployment.

## 🏛️ Architecture

The system is designed around a clear, modular processing pipeline to handle diverse input types.

<p align="center">
  <img width="1347" alt="discus System Architecture Diagram" src="https://github.com/user-attachments/assets/6cf4609a-5a3e-4084-b4f4-53d39e1929db" />
</p>

### High-Level Workflow

1.  **User Input:** A user uploads an audio, video, or image file via the frontend.
2.  **Input Processing:** The backend identifies the file type:
    *   **Video/Audio:** $\rightarrow$ **FFmpeg** $\rightarrow$ **Whisper** transcription.
    *   **Image:** $\rightarrow$ **Mistral OCR** extraction.
3.  **LLM Analysis:** The extracted text is forwarded to the configured **LLaMA model**.
4.  **Feedback Generation:** The model generates detailed improvement notes.
5.  **Output:** The frontend displays clear, structured tone and diction feedback to the user.

## 🚀 Quick Start

This project was created using `bun init` in **Bun v1.2.21**.

### Prerequisites

Ensure you have **Bun** installed.

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Variables
Create a file named `.env.local` in the project root and populate it with your API keys and configuration settings:

```
WHISPER_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
LLAMA_ENDPOINT=http://localhost:8000/v1/chat/completions # Adjust if your LLM is hosted elsewhere
FFMPEG_PATH=/usr/bin/ffmpeg # Update path if necessary
UPLOAD_DIR=./uploads
```
### 3. Run the Server
```bash
bun run --filter server dev
```
### 4. Run the Frontend
```bash
bun run --filter frontend dev
```
### 5. Run Everything with Docker
For the easiest setup, use Docker Compose:

```bash
docker-compose up -d
```
## 📝 Example Output (Generated Feedback)
The LLaMA model generates clear, actionable advice:

Your tone is generally friendly, but several sentences appear abrupt. Consider softening transitions by adding contextual lead-ins.

Some word choices are vague or overly broad. Choosing more specific terms will improve diction and clarity.

Certain complex ideas are contained in long sentences. Breaking them into shorter segments can make your delivery clearer.

## 🗺️ Roadmap
We are constantly working to enhance discus. Future plans include:

*   Support for real-time microphone/camera recording.
*   Multi-speaker diarization for group conversations.
*   Enhanced visual interface for feedback visualization and trend analysis.
*   Fine-tuned communication coaching model.
*   Cloud upload + webhook support for integrated workflows.
