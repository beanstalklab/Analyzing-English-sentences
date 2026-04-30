from pydantic import BaseModel, Field

class PosWord(BaseModel):
    word: str = Field(description="Từ hoặc cụm từ tiếng Anh (ví dụ: 'these documents', 'came by')")
    type: str = Field(description="Loại cụm từ hoặc từ loại bằng Tiếng Anh (ví dụ: Noun Phrase, Phrasal Verb, Verb Phrase, Infinitive Phrase, Pronoun, Prepositional Phrase)")
    explanation: str = Field(description="Giải thích ngắn gọn bằng Tiếng Việt về khái niệm từ loại và vai trò ngữ pháp của cụm từ này trong câu")

class SpeechChunk(BaseModel):
    chunk_text: str = Field(description="Cụm từ tiếng Anh được ngắt ra để đọc")
    analysis: str = Field(description="Phân tích bằng Tiếng Việt về cách phát âm thực tế: lướt âm, nối âm, biến âm (flap T), v.v.")
    reading: str = Field(description="Cách đọc mô phỏng bằng Tiếng Việt để người Việt dễ phát âm, ví dụ: kần-NAI, LI-vầm")

class AnalyzeResponse(BaseModel):
    chunks: list[str] = Field(description="Danh sách các cụm từ tiếng Anh đã được chia nhỏ")
    pos: list[PosWord] = Field(description="Danh sách từ loại của từng từ trong câu")
    speech_analysis: list[SpeechChunk] = Field(description="Phân tích chi tiết cách phát âm cho từng cụm từ")
    rhythm_intonation: str = Field(description="Giải thích bằng Tiếng Việt về nhịp điệu và ngữ điệu của cả câu (nhấn âm, lên/xuống giọng, phiên âm cả câu)")
    practice_tips: str = Field(description="Mẹo luyện tập phát âm (các điểm nối âm, nuốt âm cần chú ý nhất)")

class WordFormOption(BaseModel):
    text: str = Field(description="Nội dung của lựa chọn (ví dụ: 'productive')")
    is_correct: bool = Field(description="Lựa chọn này có đúng hay không")

class WordFormQuestion(BaseModel):
    sentence: str = Field(description="Câu hỏi với chỗ trống (___), ví dụ: 'The meeting was very ___.'")
    options: list[WordFormOption] = Field(description="Danh sách 4 lựa chọn (Noun, Verb, Adj, Adv)")
    correct_answer: str = Field(description="Nội dung đáp án đúng")
    explanation: str = Field(description="Giải thích chi tiết bằng Tiếng Việt tại sao đáp án đó đúng dựa trên ngữ pháp TOEIC")
    word_root: str = Field(description="Từ gốc (root word) của các lựa chọn")
