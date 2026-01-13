from fastapi import APIRouter
from .health import router as health_router
from .transcribe import router as transcribe_router

router = APIRouter()

router.include_router(transcribe_router, prefix="/transcribe", tags=["Transcribe"])
router.include_router(health_router,prefix="/health",tags=["Health"])