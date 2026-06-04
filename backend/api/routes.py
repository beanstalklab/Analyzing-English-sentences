import os
from fastapi import APIRouter, HTTPException
import json
from pydantic import BaseModel
from models.schemas import (
    AnalyzeResponse, WordFormQuestion, ImportRequest, 
    AnswerSubmitRequest, DBQuestion, UserProgressStats, HistoryItem
)
from services.llm_service import analyze_sentence, generate_word_form_question, parse_and_solve_questions
from core.database import get_db

router = APIRouter()

class AnalyzeRequest(BaseModel):
    text: str

class ExplanationUpdateRequest(BaseModel):
    explanation: str

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        result = analyze_sentence(request.text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/practice/import")
def import_questions(request: ImportRequest):
    if not request.raw_text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        questions = parse_and_solve_questions(request.raw_text)
        inserted_count = 0
        skipped_count = 0
        
        with get_db() as conn:
            cursor = conn.cursor()
            for q in questions:
                # Check for duplicates based on sentence (case-insensitive, ignoring leading/trailing spaces)
                cursor.execute("SELECT id FROM questions WHERE LOWER(TRIM(sentence)) = LOWER(TRIM(?))", (q.sentence,))
                if cursor.fetchone():
                    skipped_count += 1
                    continue

                cursor.execute("""
                    INSERT INTO questions (sentence, option_a, option_b, option_c, option_d, correct_answer, explanation, word_root)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    q.sentence, 
                    q.options[0].text if len(q.options) > 0 else "",
                    q.options[1].text if len(q.options) > 1 else "",
                    q.options[2].text if len(q.options) > 2 else "",
                    q.options[3].text if len(q.options) > 3 else "",
                    q.correct_answer, 
                    q.explanation, 
                    q.word_root
                ))
                inserted_count += 1
            conn.commit()
            
        return {"status": "success", "inserted": inserted_count, "skipped": skipped_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/practice/question", response_model=DBQuestion)
def get_question(retry_incorrect: bool = False):
    with get_db() as conn:
        cursor = conn.cursor()
        
        if retry_incorrect:
            cursor.execute("""
                SELECT * FROM questions 
                WHERE id IN (
                    SELECT question_id FROM user_progress WHERE is_correct = 0
                )
                ORDER BY RANDOM() LIMIT 1
            """)
        else:
            cursor.execute("""
                SELECT * FROM questions 
                WHERE id NOT IN (
                    SELECT question_id FROM user_progress
                )
                ORDER BY RANDOM() LIMIT 1
            """)
        row = cursor.fetchone()
        
        if not row:
            if retry_incorrect:
                raise HTTPException(status_code=404, detail="Tuyệt vời! Bạn không có câu hỏi nào bị sai để làm lại.")
            else:
                cursor.execute("SELECT COUNT(*) as c FROM user_progress WHERE is_correct = 0")
                if cursor.fetchone()["c"] > 0:
                    raise HTTPException(status_code=404, detail="Bạn đã hoàn thành tất cả câu hỏi mới! Hãy chọn chế độ 'Làm lại câu sai'.")
                else:
                    raise HTTPException(status_code=404, detail="Bạn đã làm đúng TẤT CẢ câu hỏi trong ngân hàng! Vui lòng import thêm.")
                
        return DBQuestion(
            id=row["id"],
            sentence=row["sentence"],
            options=[row["option_a"], row["option_b"], row["option_c"], row["option_d"]],
            correct_answer=row["correct_answer"],
            explanation=row["explanation"],
            word_root=row["word_root"]
        )

@router.post("/practice/answer")
def submit_answer(request: AnswerSubmitRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Verify correctness
        cursor.execute("SELECT correct_answer FROM questions WHERE id = ?", (request.question_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Question not found")
            
        is_correct = row["correct_answer"] == request.selected_answer
        
        # Check if already exists
        cursor.execute("SELECT id FROM user_progress WHERE question_id = ?", (request.question_id,))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE user_progress 
                SET selected_answer = ?, is_correct = ?, created_at = CURRENT_TIMESTAMP
                WHERE question_id = ?
            """, (request.selected_answer, is_correct, request.question_id))
        else:
            cursor.execute("""
                INSERT INTO user_progress (question_id, selected_answer, is_correct)
                VALUES (?, ?, ?)
            """, (request.question_id, request.selected_answer, is_correct))
        
        conn.commit()
        return {"status": "success", "is_correct": is_correct}

@router.patch("/practice/questions/{question_id}/explanation")
def update_question_explanation(question_id: int, request: ExplanationUpdateRequest):
    explanation = request.explanation.strip()
    if not explanation:
        raise HTTPException(status_code=400, detail="Explanation cannot be empty")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM questions WHERE id = ?", (question_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Question not found")

        cursor.execute(
            "UPDATE questions SET explanation = ? WHERE id = ?",
            (explanation, question_id)
        )
        conn.commit()

    return {
        "status": "success",
        "question_id": question_id,
        "explanation": explanation
    }

@router.get("/practice/stats", response_model=UserProgressStats)
def get_stats():
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as total FROM questions")
        total_questions = cursor.fetchone()["total"]
        
        cursor.execute("""
            SELECT 
                COUNT(*) as answered,
                SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
                SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as incorrect
            FROM (
                SELECT question_id, MAX(is_correct) as is_correct
                FROM user_progress
                GROUP BY question_id
            )
        """)
        stats_row = cursor.fetchone()
        
        answered_questions = stats_row["answered"] or 0
        correct_answers = stats_row["correct"] or 0
        incorrect_answers = stats_row["incorrect"] or 0
        
        return UserProgressStats(
            total_questions=total_questions,
            answered_questions=answered_questions,
            correct_answers=correct_answers,
            incorrect_answers=incorrect_answers
        )

@router.delete("/practice/progress")
def reset_progress():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_progress")
        conn.commit()
        return {"status": "success", "message": "Progress reset successfully"}

@router.get("/practice/questions", response_model=list[DBQuestion])
def get_questions():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM questions ORDER BY id")
        questions = []
        for row in cursor.fetchall():
            questions.append(DBQuestion(
                id=row["id"],
                sentence=row["sentence"],
                options=[row["option_a"], row["option_b"], row["option_c"], row["option_d"]],
                correct_answer=row["correct_answer"],
                explanation=row["explanation"],
                word_root=row["word_root"]
            ))

        return questions

@router.get("/practice/history", response_model=list[HistoryItem])
def get_history():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.id, p.question_id, p.selected_answer, p.is_correct, p.created_at,
                   q.sentence, q.correct_answer, q.explanation,
                   q.option_a, q.option_b, q.option_c, q.option_d, q.word_root
            FROM user_progress p
            JOIN questions q ON p.question_id = q.id
            GROUP BY p.question_id
            ORDER BY p.created_at DESC
        """)
        
        history = []
        for row in cursor.fetchall():
            history.append(HistoryItem(
                id=row["id"],
                question_id=row["question_id"],
                sentence=row["sentence"],
                options=[row["option_a"], row["option_b"], row["option_c"], row["option_d"]],
                selected_answer=row["selected_answer"],
                correct_answer=row["correct_answer"],
                is_correct=bool(row["is_correct"]),
                explanation=row["explanation"],
                word_root=row["word_root"],
                answered_at=row["created_at"]
            ))
            
        return history

@router.get("/theory/pos")
def get_theory_pos():
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

@router.get("/theory/phrases")
def get_theory_phrases():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(base_dir, "data", "theory", "Cụm từ.md")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Theory file not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from models.schemas import ConversationStartRequest, ChatMessageRequest, ChatMessage, ConversationData, ChatResponse
from services.llm_service import chat_with_persona

@router.post("/practice/conversation/start", response_model=dict)
def start_conversation(request: ConversationStartRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO conversations (scenario) VALUES (?)", (request.scenario,))
        conversation_id = cursor.lastrowid
        
        # Get first message from AI
        try:
            ai_res = chat_with_persona(request.scenario, [], None)
            reply = ai_res["reply"]
        except Exception as e:
            reply = "Hello! Let's start our conversation."
            
        cursor.execute(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, "assistant", reply)
        )
        conn.commit()
        return {"conversation_id": conversation_id, "reply": reply}

@router.post("/practice/conversation/chat", response_model=ChatResponse)
def chat_conversation(request: ChatMessageRequest):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get scenario
        cursor.execute("SELECT scenario FROM conversations WHERE id = ?", (request.conversation_id,))
        conv = cursor.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        scenario = conv["scenario"]
        
        # Insert user message
        cursor.execute(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (request.conversation_id, "user", request.message)
        )
        
        # Get history
        cursor.execute("SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC", (request.conversation_id,))
        history = [{"role": row["role"], "content": row["content"]} for row in cursor.fetchall()]
        # Remove the last one because we pass it as new_message?
        # Actually `history` inside LLM service expects past context. We can just pop the last one.
        history.pop()
        
        # Call LLM
        try:
            ai_res = chat_with_persona(scenario, history, request.message)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
        # Update user message with correction note if any
        if ai_res.get("correction"):
            cursor.execute(
                "UPDATE chat_messages SET correction_note = ? WHERE id = (SELECT id FROM chat_messages WHERE conversation_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1)",
                (ai_res["correction"], request.conversation_id)
            )
            
        # Insert AI message
        cursor.execute(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (request.conversation_id, "assistant", ai_res["reply"])
        )
        conn.commit()
        
        return ChatResponse(reply=ai_res["reply"], correction=ai_res.get("correction"))

@router.get("/practice/conversation/history", response_model=list[ConversationData])
def get_conversations_history():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM conversations ORDER BY created_at DESC")
        convs = cursor.fetchall()
        
        result = []
        for c in convs:
            cursor.execute("SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC", (c["id"],))
            msgs = []
            for m in cursor.fetchall():
                msgs.append(ChatMessage(
                    id=m["id"],
                    role=m["role"],
                    content=m["content"],
                    correction_note=m["correction_note"],
                    created_at=m["created_at"]
                ))
            result.append(ConversationData(
                id=c["id"],
                scenario=c["scenario"],
                created_at=c["created_at"],
                messages=msgs
            ))
        return result
