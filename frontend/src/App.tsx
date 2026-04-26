import { useState } from 'react';
import axios from 'axios';
import { Loader2, Mic, BookOpen, Volume2, Activity, Search } from 'lucide-react';
import type { AnalyzeResponse, PosWord, SpeechChunk } from './types/api';

const API_URL = 'http://127.0.0.1:8000/api/v1/analyze';

function App() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError('Vui lòng nhập câu tiếng Anh cần phân tích.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post<AnalyzeResponse>(API_URL, { text });
      setResult(response.data);
    } catch (err: any) {
      console.error(err);
      setError('Có lỗi xảy ra khi phân tích. Vui lòng kiểm tra lại Backend hoặc API Key.');
    } finally {
      setLoading(false);
    }
  };

  const getPosColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('pronoun')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (t.includes('noun')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (t.includes('adverb') || t.includes('adv')) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (t.includes('infinitive')) return 'bg-pink-100 text-pink-800 border-pink-200';
    if (t.includes('verb')) return 'bg-red-100 text-red-800 border-red-200';
    if (t.includes('clause')) return 'bg-teal-100 text-teal-800 border-teal-200';
    if (t.includes('adjective') || t.includes('adj')) return 'bg-green-100 text-green-800 border-green-200';
    if (t.includes('preposition') || t.includes('prep')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (t.includes('conjunction')) return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const renderHighlightedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <span key={index} className="text-orange-600 font-bold bg-orange-50 px-1 rounded">
            {part.slice(2, -2)}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="min-h-screen bg-[#eef5fc] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight flex justify-center items-center gap-3">
            <Mic className="w-9 h-9 text-slate-800" />
            English Analyzer
          </h1>
          <p className="mt-3 text-base text-slate-700 font-medium">
            English grammar and pronunciation analyzer for Vietnamese learners.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-4 sm:p-5 space-y-4">
          <div>
            <label htmlFor="sentence" className="sr-only">Nhập câu tiếng Anh</label>
            <textarea
              id="sentence"
              rows={5}
              className="block w-full rounded-2xl border border-slate-300 focus:border-[#5a67d8] focus:ring-[#5a67d8] text-lg p-5 bg-white placeholder:text-slate-500 resize-none outline-none transition-colors"
              placeholder="I can try to reach her at the resort."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAnalyze();
                }
              }}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm px-2">{error}</p>}
          
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full flex items-center justify-center py-4 border border-transparent text-lg font-medium rounded-full text-white bg-[#5a67d8] hover:bg-[#4c51bf] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5a67d8] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="w-6 h-6 mr-2" />
                Analyze Now
              </>
            )}
          </button>
        </div>

        {/* Loading Skeletons */}
        {loading && (
          <div className="space-y-6 animate-pulse">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
              <div className="h-6 bg-slate-200 rounded w-1/4"></div>
              <div className="flex gap-3">
                <div className="h-14 bg-slate-200 rounded-lg w-24"></div>
                <div className="h-14 bg-slate-200 rounded-lg w-32"></div>
                <div className="h-14 bg-slate-200 rounded-lg w-20"></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="h-6 bg-slate-200 rounded w-1/3"></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-32 bg-slate-100 rounded-xl"></div>
                <div className="h-32 bg-slate-100 rounded-xl"></div>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {!loading && result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* POS Tags Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2 rounded-t-2xl">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Part of Speech</h2>
              </div>
              <div className="p-6 pt-10">
                <div className="flex flex-wrap gap-4">
                  {result.pos.map((item: PosWord, idx: number) => (
                    <div key={idx} className={`relative group flex flex-col items-center px-4 py-2 rounded-lg border ${getPosColor(item.type)} shadow-sm cursor-help transition-all hover:ring-2 hover:ring-offset-1 hover:ring-indigo-300`}>
                      <span className="font-bold text-lg">{item.word}</span>
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-80 mt-1">{item.type}</span>
                      
                      {/* Tooltip */}
                      {item.explanation && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-3 bg-slate-800 text-left text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-10 pointer-events-none shadow-xl">
                          <p className="font-semibold mb-1 text-indigo-300">{item.type}</p>
                          <p className="font-normal leading-relaxed text-slate-100">{item.explanation}</p>
                          {/* Triangle pointer */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Speech Analysis Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-800">Connected Speech</h2>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {result.speech_analysis.map((chunk: SpeechChunk, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-5 border border-slate-100 hover:border-indigo-100 transition-colors">
                      <div className="text-xl font-bold text-slate-800 mb-2">{chunk.chunk_text}</div>
                      <div className="text-indigo-600 font-medium mb-3 text-lg flex items-center gap-2">
                        /{renderHighlightedText(chunk.reading)}/
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed">{renderHighlightedText(chunk.analysis)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rhythm & Intonation Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-indigo-900">Rhythm & Intonation</h2>
              </div>
              <div className="p-6">
                <p className="text-slate-700 text-base leading-relaxed whitespace-pre-line">{renderHighlightedText(result.rhythm_intonation)}</p>
              </div>
            </div>

            {/* Practice Tips Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h2 className="text-lg font-semibold text-amber-900">Practice Tips</h2>
              </div>
              <div className="p-6">
                <p className="text-slate-700 text-base leading-relaxed whitespace-pre-line">{renderHighlightedText(result.practice_tips)}</p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default App;
