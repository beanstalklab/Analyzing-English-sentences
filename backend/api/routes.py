from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.schemas import AnalyzeResponse
from services.llm_service import analyze_sentence

router = APIRouter()

class AnalyzeRequest(BaseModel):
    text: str

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        result = analyze_sentence(request.text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
