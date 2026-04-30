import { useState, useEffect, useMemo, useRef, useCallback, isValidElement, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import axios from 'axios';
import { Loader2, Mic, BookOpen, Volume2, Activity, Search, BrainCircuit, CheckCircle2, XCircle, ArrowRight, RotateCcw, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnalyzeResponse, PosWord, SpeechChunk, WordFormQuestion } from './types/api';

const ANALYZE_API_URL = 'http://127.0.0.1:8000/api/v1/analyze';
const PRACTICE_API_URL = 'http://127.0.0.1:8000/api/v1/word-form/generate';
const THEORY_API_URL = 'http://127.0.0.1:8000/api/v1/theory/pos';

type MarkdownChildrenProps = {
  children?: ReactNode;
};

type TocMetrics = {
  maxScroll: number;
  maxThumbTop: number;
  thumbHeight: number;
};

function App() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState('');
  
  // App State
  const [mode, setMode] = useState<'analyze' | 'learn' | 'practice'>('analyze');
  const [activeTopic, setActiveTopic] = useState<'pos'>('pos');
  const [theoryContent, setTheoryContent] = useState<string>('');
  const [theoryLoading, setTheoryLoading] = useState(false);
  const [activeId, setActiveId] = useState<string>('');
  const tocScrollRef = useRef<HTMLDivElement>(null);
  const tocScrollbarRef = useRef<HTMLDivElement>(null);
  const tocThumbRef = useRef<HTMLDivElement>(null);
  const tocDragRef = useRef<{ pointerId: number; startY: number; startScrollTop: number; maxScroll: number; maxThumbTop: number } | null>(null);

  // Helper to extract text from React children for ID generation
  const getTextContent = (children: ReactNode): string => {
    if (children === null || children === undefined || typeof children === 'boolean') return '';
    if (typeof children === 'string' || typeof children === 'number' || typeof children === 'bigint') return String(children);
    if (Array.isArray(children)) return children.map(getTextContent).join('');
    if (isValidElement<MarkdownChildrenProps>(children)) return getTextContent(children.props.children);
    return '';
  };

  // ID Generation for TOC
  const slugify = (text: string) => {
    return text.toString().toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  // TOC State
  const toc = useMemo(() => {
    if (!theoryContent) return [];
    const lines = theoryContent.split('\n');
    return lines
      .filter(line => line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### '))
      .map(line => {
        let level = 3;
        if (line.startsWith('# ')) level = 1;
        else if (line.startsWith('## ')) level = 2;
        
        const text = line.replace(/^#+ /, '').trim();
        const id = slugify(text);
        return { level, text, id };
      });
  }, [theoryContent]);

  const getTocMetrics = useCallback((): TocMetrics | null => {
    const scrollEl = tocScrollRef.current;
    const trackEl = tocScrollbarRef.current;
    const thumbEl = tocThumbRef.current;
    if (!scrollEl || !trackEl || !thumbEl) return null;

    const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
    const trackHeight = trackEl.clientHeight;
    if (maxScroll <= 1 || trackHeight <= 0) return null;

    const thumbHeight = Math.min(
      trackHeight,
      Math.max((scrollEl.clientHeight / scrollEl.scrollHeight) * trackHeight, 52)
    );
    const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);

    return { maxScroll, maxThumbTop, thumbHeight };
  }, []);

  const syncTocThumb = useCallback(() => {
    const trackEl = tocScrollbarRef.current;
    const thumbEl = tocThumbRef.current;
    const scrollEl = tocScrollRef.current;
    if (!trackEl || !thumbEl || !scrollEl) return;

    const metrics = getTocMetrics();
    trackEl.dataset.scrollable = metrics ? 'true' : 'false';

    if (!metrics) {
      thumbEl.style.height = '52px';
      thumbEl.style.transform = 'translate3d(-50%, 0, 0)';
      return;
    }

    const thumbTop = (scrollEl.scrollTop / metrics.maxScroll) * metrics.maxThumbTop;
    thumbEl.style.height = `${metrics.thumbHeight}px`;
    thumbEl.style.transform = `translate3d(-50%, ${thumbTop}px, 0)`;
  }, [getTocMetrics]);

  useEffect(() => {
    if (mode !== 'learn') return;

    const scrollEl = tocScrollRef.current;
    if (!scrollEl) return;

    let frame = 0;
    const requestUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        syncTocThumb();
        frame = 0;
      });
    };

    scrollEl.addEventListener('scroll', requestUpdate, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(requestUpdate)
      : null;

    resizeObserver?.observe(scrollEl);
    if (scrollEl.firstElementChild) resizeObserver?.observe(scrollEl.firstElementChild);
    window.addEventListener('resize', requestUpdate);
    requestUpdate();

    return () => {
      scrollEl.removeEventListener('scroll', requestUpdate);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', requestUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode, toc.length, theoryLoading, syncTocThumb]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const drag = tocDragRef.current;
      const scrollEl = tocScrollRef.current;
      if (!drag || !scrollEl || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      const scrollDelta = ((event.clientY - drag.startY) / Math.max(drag.maxThumbTop, 1)) * drag.maxScroll;
      scrollEl.scrollTop = Math.min(drag.maxScroll, Math.max(0, drag.startScrollTop + scrollDelta));
      syncTocThumb();
    };

    const handlePointerEnd = (event: globalThis.PointerEvent) => {
      const drag = tocDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const thumbEl = tocThumbRef.current;
      if (thumbEl?.hasPointerCapture(event.pointerId)) {
        thumbEl.releasePointerCapture(event.pointerId);
      }
      tocDragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [syncTocThumb]);

  const handleTocThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollEl = tocScrollRef.current;
    const metrics = getTocMetrics();
    if (!scrollEl || !metrics) return;

    event.preventDefault();
    event.stopPropagation();
    tocDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollEl.scrollTop,
      maxScroll: metrics.maxScroll,
      maxThumbTop: metrics.maxThumbTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTocTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    const scrollEl = tocScrollRef.current;
    const metrics = getTocMetrics();
    if (!scrollEl || !metrics) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const targetThumbTop = event.clientY - rect.top - metrics.thumbHeight / 2;
    const ratio = Math.min(1, Math.max(0, targetThumbTop / Math.max(metrics.maxThumbTop, 1)));
    scrollEl.scrollTop = metrics.maxScroll * ratio;
    syncTocThumb();
  };

  const handleTocScrollbarWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const scrollEl = tocScrollRef.current;
    if (!scrollEl) return;

    event.preventDefault();
    scrollEl.scrollTop += event.deltaY;
    syncTocThumb();
  };

  // Track active heading
  useEffect(() => {
    if (mode !== 'learn' || theoryLoading || !theoryContent) return;
    
    // Small delay to ensure ReactMarkdown has rendered to DOM
    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          // Get all entries that are even partially visible
          const visibleEntries = entries.filter(e => e.isIntersecting);
          
          if (visibleEntries.length > 0) {
            // Find the one closest to the top of the viewport
            const closestToTop = visibleEntries.reduce((prev, curr) => {
              return (Math.abs(curr.boundingClientRect.top) < Math.abs(prev.boundingClientRect.top)) ? curr : prev;
            });
            setActiveId(closestToTop.target.id);
          }
        },
        { 
          rootMargin: '-10% 0% -40% 0%', // Broader detection area
          threshold: [0, 0.1, 0.5] 
        }
      );

      const headings = document.querySelectorAll('.learn-content h1, .learn-content h2, .learn-content h3');
      headings.forEach((h) => observer.observe(h));

      return () => {
        headings.forEach((h) => observer.unobserve(h));
      };
    }, 500);

    return () => clearTimeout(timer);
  }, [mode, theoryContent, theoryLoading]);

  // Practice State
  const [question, setQuestion] = useState<WordFormQuestion | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError('Vui lòng nhập câu tiếng Anh cần phân tích.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post<AnalyzeResponse>(ANALYZE_API_URL, { text });
      setResult(response.data);
    } catch (err: unknown) {
      console.error(err);
      setError('Có lỗi xảy ra khi phân tích. Vui lòng kiểm tra lại Backend hoặc API Key.');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchQuestion = async () => {
    setPracticeLoading(true);
    setQuestion(null);
    setSelectedIdx(null);
    setIsAnswered(false);
    setError('');

    try {
      const response = await axios.post<WordFormQuestion>(PRACTICE_API_URL);
      setQuestion(response.data);
    } catch (err: unknown) {
      console.error(err);
      setError('Không thể tải câu hỏi. Vui lòng thử lại.');
    } finally {
      setPracticeLoading(false);
    }
  };

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedIdx(idx);
    setIsAnswered(true);
  };

  const handleFetchTheory = async () => {
    setTheoryLoading(true);
    setError('');
    try {
      const response = await axios.get<{content: string}>(THEORY_API_URL);
      setTheoryContent(response.data.content);
    } catch (err: unknown) {
      console.error(err);
      setError('Không thể tải nội dung lý thuyết.');
    } finally {
      setTheoryLoading(false);
    }
  };

  const MarkdownComponents = {
    h1: ({ children }: MarkdownChildrenProps) => {
      const id = slugify(getTextContent(children));
      return (
        <h1 id={id} className="text-4xl font-extrabold text-slate-900 mt-16 mb-8 scroll-mt-24 tracking-tight">
          {children}
        </h1>
      );
    },
    h2: ({ children }: MarkdownChildrenProps) => {
      const id = slugify(getTextContent(children));
      return (
        <h2 id={id} className="text-2xl font-bold text-slate-800 mt-12 mb-6 scroll-mt-24 pl-5 border-l-4 border-indigo-500 tracking-tight">
          {children}
        </h2>
      );
    },
    h3: ({ children }: MarkdownChildrenProps) => {
      const id = slugify(getTextContent(children));
      return (
        <h3 id={id} className="text-xl font-bold text-indigo-600 mt-8 mb-4 scroll-mt-24 tracking-wide">
          {children}
        </h3>
      );
    },
    table: ({ children }: MarkdownChildrenProps) => (
      <div className="my-10 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full border-collapse bg-white text-sm text-left">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: MarkdownChildrenProps) => (
      <thead className="bg-slate-50 border-b border-slate-200">
        {children}
      </thead>
    ),
    th: ({ children }: MarkdownChildrenProps) => (
      <th className="px-6 py-4 font-bold text-slate-900 uppercase tracking-wider text-xs">
        {children}
      </th>
    ),
    td: ({ children }: MarkdownChildrenProps) => (
      <td className="px-6 py-4 text-slate-600 border-b border-slate-50 last:border-0">
        {children}
      </td>
    ),
    blockquote: ({ children }: MarkdownChildrenProps) => (
      <div className="my-8 p-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl group hover:bg-white hover:border-indigo-300 transition-all duration-300">
        <div className="pro-tip-content text-indigo-900 leading-relaxed font-medium">{children}</div>
      </div>
    ),
    p: ({ children }: MarkdownChildrenProps) => (
      <p className="mb-6 leading-relaxed text-slate-600 font-normal text-lg">{children}</p>
    ),
    ul: ({ children }: MarkdownChildrenProps) => (
      <ul className="mb-8 space-y-3 list-none pl-1">{children}</ul>
    ),
    li: ({ children }: MarkdownChildrenProps) => (
      <li className="flex items-start gap-3 group">
        <span className="w-2 h-2 rounded-full bg-indigo-400 mt-2.5 flex-shrink-0 group-hover:scale-125 transition-transform" />
        <span className="text-slate-600 leading-relaxed text-lg">{children}</span>
      </li>
    ),
    em: ({ children }: MarkdownChildrenProps) => (
      <em className="bg-indigo-50/50 text-indigo-700 px-1.5 py-0.5 rounded italic font-medium not-italic border border-indigo-100/50">
        {children}
      </em>
    ),
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
    <div className="min-h-screen bg-[#eef5fc] py-12 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-500">
      <div className="max-w-3xl mx-auto space-y-8 transition-all duration-500">
        
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="flex flex-col items-center gap-4">
            {/* Main Tabs */}
            <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 flex">
              <button
                onClick={() => setMode('analyze')}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'analyze' 
                    ? 'bg-[#5a67d8] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Search className="w-4 h-4" />
                Analyzer
              </button>
              <button
                onClick={() => {
                  setMode('learn');
                  if (!theoryContent && activeTopic === 'pos') handleFetchTheory();
                }}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'learn' 
                    ? 'bg-[#5a67d8] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Learn
              </button>
              <button
                onClick={() => {
                  setMode('practice');
                  if (!question && activeTopic === 'pos') handleFetchQuestion();
                }}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'practice' 
                    ? 'bg-[#5a67d8] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <BrainCircuit className="w-4 h-4" />
                Practice
              </button>
            </div>

            {/* Sub-Topic Tabs (Only for Learn and Practice) */}
            {(mode === 'learn' || mode === 'practice') && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Chủ đề:</span>
                <button
                  onClick={() => setActiveTopic('pos')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    activeTopic === 'pos'
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                      : 'text-slate-500 border-transparent hover:border-slate-200'
                  }`}
                >
                  Từ loại (POS)
                </button>
                <span className="text-xs font-medium text-slate-300 italic px-2">More coming soon...</span>
              </div>
            )}
          </div>

          <div>
            <h1 className="text-4xl font-bold text-slate-800 tracking-tight flex justify-center items-center gap-3">
              {mode === 'analyze' ? <Mic className="w-9 h-9" /> : mode === 'learn' ? <BookOpen className="w-9 h-9" /> : <BrainCircuit className="w-9 h-9" />}
              {mode === 'analyze' ? 'English Analyzer' : mode === 'learn' ? 'Learning: Theory' : 'Practice: Exercise'}
            </h1>
            <p className="mt-3 text-base text-slate-700 font-medium">
              {mode === 'analyze' 
                ? 'English grammar and pronunciation analyzer for Vietnamese learners.'
                : mode === 'learn'
                  ? 'Build your foundational knowledge with detailed theory.'
                  : 'Sharpen your skills with AI-powered practice questions.'}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            {mode === 'analyze' ? (
          <>
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
          </>
        ) : mode === 'learn' ? (
          <div className="animate-in fade-in duration-500">
            {theoryLoading ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-slate-500 font-medium">Preparing your lesson...</p>
              </div>
            ) : activeTopic === 'pos' ? (
              <div className="relative">
                {/* Sidebar TOC - Positioned exactly 32px (mr-8) to the left of the content card */}
                <div className="hidden xl:block absolute right-full top-0 h-full">
                  <aside className="sticky top-8 mr-8 w-[280px] h-[calc(100vh-8rem)] bg-white/60 backdrop-blur-md rounded-3xl border border-slate-200/50 flex flex-col shadow-sm transition-all hover:bg-white hover:border-slate-200 duration-300 overflow-hidden p-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 shrink-0">
                      <Activity className="w-3 h-3 text-indigo-400" />
                      Nội dung bài học
                    </h4>
                    <div className="learn-toc-scroll-shell min-h-0 flex-1 overflow-hidden">
                      <div ref={tocScrollRef} onScroll={syncTocThumb} className="overflow-y-auto custom-scrollbar h-full min-h-0 pr-4">
                        <nav className="space-y-1">
                          {toc.map((item, i) => (
                            <a
                              key={i}
                              href={`#${item.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                                window.history.pushState(null, '', `#${item.id}`);
                                setActiveId(item.id);
                              }}
                              className={`block py-2.5 px-3 rounded-xl text-sm transition-all flex items-center gap-2 group ${
                                activeId === item.id 
                                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100' 
                                  : 'hover:bg-white hover:shadow-md hover:scale-[1.02]'
                              } ${
                                item.level === 1 
                                  ? 'font-black text-base mt-4 border-b border-slate-100 pb-2 mb-2' 
                                  : item.level === 3 
                                    ? 'pl-8 text-slate-500 font-medium' 
                                    : 'pl-4 font-bold text-slate-700'
                              }`}
                            >
                              {item.level === 1 && (
                                <div className={`w-1.5 h-4 rounded-full mr-1 transition-colors ${
                                  activeId === item.id ? 'bg-indigo-600' : 'bg-indigo-300'
                                }`} />
                              )}
                              {item.level === 2 && <ChevronRight className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 -ml-1 transition-all" />}
                              {item.text}
                            </a>
                          ))}
                        </nav>
                      </div>
                      <div
                        ref={tocScrollbarRef}
                        className="learn-toc-scrollbar"
                        onPointerDown={handleTocTrackPointerDown}
                        onWheel={handleTocScrollbarWheel}
                        aria-hidden="true"
                      >
                        <div
                          ref={tocThumbRef}
                          className="learn-toc-scrollbar-thumb"
                          onPointerDown={handleTocThumbPointerDown}
                        />
                      </div>
                    </div>
                  </aside>
                </div>

                {/* Main Reading Content - Exactly 768px (max-w-3xl) and centered */}
                <div className="w-full bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-8 sm:p-12 learn-content relative overflow-hidden transition-all duration-500">
                  <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500 opacity-10"></div>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={MarkdownComponents}
                  >
                    {theoryContent}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 text-center text-slate-500">
                Select a topic to start learning.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Practice Mode UI */}
            {practiceLoading ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse">Generating TOEIC question...</p>
              </div>
            ) : activeTopic === 'pos' && question ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-indigo-50 border-b border-indigo-100 px-8 py-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                        Word Form Root: {question.word_root}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold text-slate-800 leading-relaxed">
                      {question.sentence.split('___').map((part, i, arr) => (
                        <span key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <span className="mx-1 px-4 py-1 bg-slate-200 rounded-lg text-transparent select-none border-b-2 border-indigo-400">
                              ____
                            </span>
                          )}
                        </span>
                      ))}
                    </p>
                  </div>
                  
                  <div className="p-8 grid gap-4 sm:grid-cols-2">
                    {question.options.map((opt, idx) => {
                      const isSelected = selectedIdx === idx;
                      const isCorrect = opt.is_correct;
                      let btnClass = "relative flex items-center justify-between p-5 rounded-2xl border-2 text-lg font-medium transition-all duration-200 ";
                      
                      if (!isAnswered) {
                        btnClass += "border-slate-100 bg-slate-50 hover:border-indigo-300 hover:bg-white hover:shadow-md text-slate-700";
                      } else {
                        if (isCorrect) {
                          btnClass += "border-green-500 bg-green-50 text-green-700 shadow-sm";
                        } else if (isSelected) {
                          btnClass += "border-red-500 bg-red-50 text-red-700 shadow-sm";
                        } else {
                          btnClass += "border-slate-50 bg-slate-25 text-slate-400 opacity-60";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectOption(idx)}
                          disabled={isAnswered}
                          className={btnClass}
                        >
                          <span>{opt.text}</span>
                          {isAnswered && isCorrect && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                          {isAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-500" />}
                        </button>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div className="p-8 pt-0 animate-in zoom-in-95 duration-300">
                      <div className={`rounded-2xl p-6 ${selectedIdx !== null && question.options[selectedIdx].is_correct ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-100'}`}>
                        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                          {selectedIdx !== null && question.options[selectedIdx].is_correct 
                            ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Correct!</>
                            : <><RotateCcw className="w-5 h-5 text-amber-600" /> Explanation</>
                          }
                        </h3>
                        <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                          {question.explanation}
                        </p>
                      </div>
                      
                      <button
                        onClick={handleFetchQuestion}
                        className="mt-6 w-full flex items-center justify-center py-4 rounded-full bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                      >
                        Next Question
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 text-center space-y-6">
                <div className="bg-indigo-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
                  <BrainCircuit className="w-10 h-10 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Ready to practice?</h2>
                  <p className="text-slate-500 mt-2">Test your knowledge of English word forms.</p>
                </div>
                <button
                  onClick={handleFetchQuestion}
                  className="px-8 py-4 bg-[#5a67d8] text-white font-bold rounded-full hover:bg-[#4c51bf] transition-all shadow-lg"
                >
                  Start Practicing
                </button>
              </div>
            )}
            
            {error && mode === 'practice' && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-center font-medium">
                {error}
                <button onClick={handleFetchQuestion} className="ml-3 underline">Try again</button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  </div>
</div>
  );
}

export default App;
