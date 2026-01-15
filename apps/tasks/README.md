## Video Transcription Server

This is a FastAPI server that handles video transcription tasks.

### Setup

1. Activate the virtual environment:
```bash
source .venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```


3. Run the server:
```bash
uvicorn main:app --reload
```

### Endpoints

- `POST /transcribe`