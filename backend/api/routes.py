import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.schemas import AnalyzeResponse, WordFormQuestion
from services.llm_service import analyze_sentence, generate_word_form_question

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

@router.post("/word-form/generate", response_model=WordFormQuestion)
def generate_word_form():
    try:
        result = generate_word_form_question()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/theory/pos")
def get_theory_pos():
    # Use path relative to this file
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, "data", "theory", "Từ loại.md")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Theory file not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
