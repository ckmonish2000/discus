from services import ffmpeg
# from fastapi import FastAPI
# from routes import router as routes

# app = FastAPI()

# app.include_router(routes)

ffmpeg.convert_to_audio("./assets/video.mp4")
