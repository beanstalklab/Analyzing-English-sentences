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
