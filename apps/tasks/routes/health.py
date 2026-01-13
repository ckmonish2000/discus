from fastapi import APIRouter

router = APIRouter()

@router.get('/',status_code=200)
def healthCheck():
    return {"status": "ok"}