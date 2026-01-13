from fastapi import FastAPI
from routes import router as routes

app = FastAPI()

app.include_router(routes)