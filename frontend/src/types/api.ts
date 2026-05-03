export interface PosWord {
  word: string;
  type: string;
  explanation: string;
}

export interface SpeechChunk {
  chunk_text: string;
  analysis: string;
  reading: string;
}

export interface AnalyzeResponse {
  chunks: string[];
  pos: PosWord[];
  speech_analysis: SpeechChunk[];
  rhythm_intonation: string;
  practice_tips: string;
}

export interface WordFormOption {
  text: string;
  is_correct: boolean;
}

export interface WordFormQuestion {
  sentence: string;
  options: WordFormOption[];
  correct_answer: string;
  explanation: string;
  word_root: string;
}

export interface DBQuestion {
  id: number;
  sentence: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  word_root: string;
}

export interface UserProgressStats {
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  incorrect_answers: number;
}

export interface HistoryItem {
  id: number;
  question_id: number;
  sentence: string;
  options: string[];
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
  word_root: string;
  answered_at: string;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  correction_note?: string | null;
  created_at?: string;
}

export interface ChatResponse {
  reply: string;
  correction?: string | null;
}

export interface ConversationData {
  id: number;
  scenario: string;
  created_at: string;
  messages: ChatMessage[];
}
