import { useState, useEffect, useMemo, useRef, useCallback, isValidElement, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import axios from 'axios';
import { Loader2, Mic, BookOpen, Volume2, Activity, Search, BrainCircuit, CheckCircle2, XCircle, ArrowRight, RotateCcw, ChevronRight, ChevronLeft, LayoutDashboard, UploadCloud, PieChart, Clock, Filter, ChevronDown, ChevronUp, MessageSquare, Coffee, Briefcase, Plane, Send, Lightbulb, User, Pencil, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AnalyzeResponse, PosWord, SpeechChunk, DBQuestion, UserProgressStats, HistoryItem, ChatMessage } from './types/api';

const API_BASE = `http://${window.location.hostname}:8000/api/v1`;
const ANALYZE_API_URL = `${API_BASE}/analyze`;
const PRACTICE_API_URL = `${API_BASE}/practice`;
const THEORY_API_URL = `${API_BASE}/theory/pos`;
const PHRASES_API_URL = `${API_BASE}/theory/phrases`;

type MarkdownChildrenProps = {
  children?: ReactNode;
};

type TocMetrics = {
  maxScroll: number;
  maxThumbTop: number;
  thumbHeight: number;
};

type PracticeDisplayItem =
  | { type: 'live'; question: DBQuestion | null; selectedIdx: number | null; isAnswered: boolean }
  | { type: 'history'; item: HistoryItem }
  | null;

function App() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState('');
  
  // App State
  const [mode, setMode] = useState<'analyze' | 'learn' | 'practice' | 'dashboard'>('analyze');
  const [activeTopic, setActiveTopic] = useState<'pos' | 'phrases' | 'conversation'>('pos');
  const [theoryContent, setTheoryContent] = useState<string>('');
  const [theoryLoading, setTheoryLoading] = useState(false);
  const [phrasesContent, setPhrasesContent] = useState<string>('');
  const [phrasesLoading, setPhrasesLoading] = useState(false);
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
  // Determine which content to use for TOC based on active topic
  const activeLearnContent = activeTopic === 'phrases' ? phrasesContent : theoryContent;
  const activeLearnLoading = activeTopic === 'phrases' ? phrasesLoading : theoryLoading;

  const toc = useMemo(() => {
    if (!activeLearnContent) return [];
    const lines = activeLearnContent.split('\n');
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
  }, [activeLearnContent]);

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
  }, [mode, toc.length, theoryLoading, phrasesLoading, syncTocThumb]);

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
    if (mode !== 'learn' || activeLearnLoading || !activeLearnContent) return;
    
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
  }, [mode, activeLearnContent, activeLearnLoading, activeTopic]);

  // Practice State
  const [question, setQuestion] = useState<DBQuestion | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [viewOffset, setViewOffset] = useState(0);
  const [practiceMode, setPracticeMode] = useState<'new' | 'retry'>('new');
  
  // Chat State
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  // Dashboard State
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [stats, setStats] = useState<UserProgressStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [questionBank, setQuestionBank] = useState<DBQuestion[]>([]);
  const [dashboardTab, setDashboardTab] = useState<'questions' | 'stats' | 'import'>('questions');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [expandedBankQuestionId, setExpandedBankQuestionId] = useState<number | null>(null);
  const [editingExplanationQuestionId, setEditingExplanationQuestionId] = useState<number | null>(null);
  const [explanationDraft, setExplanationDraft] = useState('');
  const [savingExplanationId, setSavingExplanationId] = useState<number | null>(null);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'correct') return history.filter(h => h.is_correct);
    if (historyFilter === 'incorrect') return history.filter(h => !h.is_correct);
    return history;
  }, [history, historyFilter]);

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
    setViewOffset(0);
    setError('');

    try {
      const response = await axios.get<DBQuestion>(`${PRACTICE_API_URL}/question?retry_incorrect=${practiceMode === 'retry'}`);
      setQuestion(response.data);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 404) {
        setError(err.response.data.detail || 'Ngân hàng câu hỏi trống.');
      } else {
        setError('Không thể tải câu hỏi. Vui lòng thử lại.');
      }
    } finally {
      setPracticeLoading(false);
    }
  };

  const handlePracticeModeChange = (newMode: 'new' | 'retry') => {
    if (practiceMode === newMode) return;
    setPracticeMode(newMode);
    setQuestion(null);
    setIsAnswered(false);
    setSelectedIdx(null);
    setViewOffset(0);
    setError('');
  };

  const handleStartConversation = async (scenario: string) => {
    setActiveScenario(scenario);
    setChatLoading(true);
    setChatMessages([]);
    try {
      const res = await axios.post(`${PRACTICE_API_URL}/conversation/start`, { scenario });
      setConversationId(res.data.conversation_id);
      setChatMessages([
        { role: 'assistant', content: res.data.reply }
      ]);
    } catch (err) {
      console.error(err);
      setError('Error starting conversation.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !conversationId) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    
    try {
      const res = await axios.post(`${PRACTICE_API_URL}/conversation/chat`, {
        conversation_id: conversationId,
        message: userMsg
      });
      
      if (res.data.correction) {
        setChatMessages(prev => {
          const newMsgs = [...prev];
          const lastUserIdx = newMsgs.map(m => m.role).lastIndexOf('user');
          if (lastUserIdx >= 0) {
            newMsgs[lastUserIdx] = { ...newMsgs[lastUserIdx], correction_note: res.data.correction };
          }
          return newMsgs;
        });
      }
      
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      console.error(err);
      setError('Error sending message.');
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const handleSelectOption = async (idx: number) => {
    if (isAnswered || !question) return;
    setSelectedIdx(idx);
    setIsAnswered(true);
    
    try {
      await axios.post(`${PRACTICE_API_URL}/answer`, {
        question_id: question.id,
        selected_answer: question.options[idx]
      });
      handleFetchStats();
    } catch (err) {
      console.error("Error saving answer", err);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    setError('');
    try {
      const res = await axios.post(`${PRACTICE_API_URL}/import`, { raw_text: importText });
      let msg = `Nhập thành công ${res.data.inserted} câu hỏi mới!`;
      if (res.data.skipped > 0) {
        msg += `\nĐã bỏ qua ${res.data.skipped} câu bị trùng lặp.`;
      }
      alert(msg);
      setImportText('');
      handleFetchStats();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Lỗi khi import câu hỏi');
    } finally {
      setImportLoading(false);
    }
  };

  const handleFetchStats = async () => {
    try {
      const [statsRes, historyRes, questionsRes] = await Promise.all([
        axios.get<UserProgressStats>(`${PRACTICE_API_URL}/stats`),
        axios.get<HistoryItem[]>(`${PRACTICE_API_URL}/history`),
        axios.get<DBQuestion[]>(`${PRACTICE_API_URL}/questions`)
      ]);
      setStats(statsRes.data);
      setHistory(historyRes.data);
      setQuestionBank(questionsRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetProgress = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài? Hành động này không thể hoàn tác.')) {
      try {
        await axios.delete(`${PRACTICE_API_URL}/progress`);
        alert('Đã xóa lịch sử làm bài thành công. Bạn có thể bắt đầu làm lại từ đầu!');
        handleFetchStats();
      } catch (err) {
        console.error(err);
        alert('Lỗi khi xóa lịch sử làm bài.');
      }
    }
  };

  const handleStartEditExplanation = (questionId: number, explanation: string) => {
    setEditingExplanationQuestionId(questionId);
    setExplanationDraft(explanation);
  };

  const handleCancelEditExplanation = () => {
    setEditingExplanationQuestionId(null);
    setExplanationDraft('');
  };

  const handleSaveExplanation = async (questionId: number) => {
    const nextExplanation = explanationDraft.trim();
    if (!nextExplanation) {
      alert('Explanation không được để trống.');
      return;
    }

    setSavingExplanationId(questionId);
    try {
      const res = await axios.patch<{ explanation: string }>(
        `${PRACTICE_API_URL}/questions/${questionId}/explanation`,
        { explanation: nextExplanation }
      );
      const savedExplanation = res.data.explanation;

      setHistory(prev => prev.map(item => (
        item.question_id === questionId
          ? { ...item, explanation: savedExplanation }
          : item
      )));

      setQuestionBank(prev => prev.map(item => (
        item.id === questionId
          ? { ...item, explanation: savedExplanation }
          : item
      )));

      setQuestion(prev => (
        prev?.id === questionId
          ? { ...prev, explanation: savedExplanation }
          : prev
      ));

      setEditingExplanationQuestionId(null);
      setExplanationDraft('');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Không thể lưu explanation.');
    } finally {
      setSavingExplanationId(null);
    }
  };

  useEffect(() => {
    if (mode === 'dashboard' || mode === 'practice') {
      handleFetchStats();
    }
  }, [mode]);

  const maxOffset = useMemo(() => isAnswered ? history.length : history.length, [history.length, isAnswered]);

  const handlePrevious = useCallback(() => {
    setViewOffset(v => Math.min(v + 1, maxOffset));
  }, [maxOffset]);

  const handleNext = useCallback(() => {
    setViewOffset(v => {
      if (v > 0) return v - 1;
      if (v === 0 && isAnswered) {
        handleFetchQuestion();
        return 0;
      }
      return v;
    });
  }, [isAnswered]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'practice') return;
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handlePrevious, handleNext]);

  const displayItem = useMemo<PracticeDisplayItem>(() => {
    if (viewOffset === 0) {
      return { type: 'live', question, selectedIdx, isAnswered };
    }

    const idx = isAnswered ? viewOffset : viewOffset - 1;
    const item = history[idx];
    return item ? { type: 'history', item } : null;
  }, [viewOffset, isAnswered, question, selectedIdx, history]);

  const dQuestion = displayItem?.type === 'history' ? displayItem.item : displayItem?.question;
  const dOptions = displayItem?.type === 'history' ? displayItem.item.options : displayItem?.question?.options;
  const dCorrectAnswer = displayItem?.type === 'history' ? displayItem.item.correct_answer : displayItem?.question?.correct_answer;
  const dExplanation = displayItem?.type === 'history' ? displayItem.item.explanation : displayItem?.question?.explanation;
  const dWordRoot = displayItem?.type === 'history' ? displayItem.item.word_root : displayItem?.question?.word_root;
  const dSentence = displayItem?.type === 'history' ? displayItem.item.sentence : displayItem?.question?.sentence;
  const dIsAnswered = displayItem?.type === 'history' ? true : displayItem?.isAnswered;
  const dSelectedIdx = displayItem?.type === 'history' ? displayItem.item.options.findIndex(o => o === displayItem.item.selected_answer) : displayItem?.selectedIdx;
  const dSelectedAnswer = dSelectedIdx !== null && dSelectedIdx !== undefined ? dOptions?.[dSelectedIdx] : undefined;
  const dIsCorrectSelection = Boolean(dIsAnswered && dSelectedAnswer === dCorrectAnswer);


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

  const handleFetchPhrases = async () => {
    setPhrasesLoading(true);
    setError('');
    try {
      const response = await axios.get<{content: string}>(PHRASES_API_URL);
      setPhrasesContent(response.data.content);
    } catch (err: unknown) {
      console.error(err);
      setError('Không thể tải nội dung cụm từ.');
    } finally {
      setPhrasesLoading(false);
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
                  if (!phrasesContent && activeTopic === 'phrases') handleFetchPhrases();
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
              <button
                onClick={() => setMode('dashboard')}
                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === 'dashboard' 
                    ? 'bg-[#5a67d8] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Data
              </button>
            </div>

            {/* Sub-Topic Tabs (Only for Learn and Practice) */}
            {(mode === 'learn' || mode === 'practice') && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Chủ đề:</span>
                <button
                  onClick={() => {
                    setActiveTopic('pos');
                    if (mode === 'learn' && !theoryContent) handleFetchTheory();
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    activeTopic === 'pos'
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                      : 'text-slate-500 border-transparent hover:border-slate-200'
                  }`}
                >
                  Từ loại (POS)
                </button>
                {mode === 'learn' && (
                  <button
                    onClick={() => {
                      setActiveTopic('phrases');
                      if (!phrasesContent) handleFetchPhrases();
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                      activeTopic === 'phrases'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        : 'text-slate-500 border-transparent hover:border-slate-200'
                    }`}
                  >
                    <Lightbulb className="w-3 h-3" />
                    Cụm từ (Phrases)
                  </button>
                )}
                {mode === 'practice' && (
                  <button
                    onClick={() => setActiveTopic('conversation')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                      activeTopic === 'conversation'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        : 'text-slate-500 border-transparent hover:border-slate-200'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Giao tiếp (Conversation)
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-4xl font-bold text-slate-800 tracking-tight flex justify-center items-center gap-3">
              {mode === 'analyze' ? <Mic className="w-9 h-9" /> : mode === 'learn' ? <BookOpen className="w-9 h-9" /> : mode === 'practice' ? <BrainCircuit className="w-9 h-9" /> : <LayoutDashboard className="w-9 h-9" />}
              {mode === 'analyze' ? 'English Analyzer' : mode === 'learn' ? 'Learning: Theory' : mode === 'practice' ? 'Practice: Exercise' : 'Data Dashboard'}
            </h1>
            <p className="mt-3 text-base text-slate-700 font-medium">
              {mode === 'analyze' 
                ? 'English grammar and pronunciation analyzer for Vietnamese learners.'
                : mode === 'learn'
                  ? 'Build your foundational knowledge with detailed theory.'
                  : mode === 'practice'
                    ? 'Sharpen your skills with AI-powered practice questions.'
                    : 'Manage question bank and track your learning progress.'}
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
            {activeLearnLoading ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-slate-500 font-medium">Preparing your lesson...</p>
              </div>
            ) : (activeTopic === 'pos' || activeTopic === 'phrases') && activeLearnContent ? (
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
                    {activeLearnContent}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 text-center text-slate-500">
                Select a topic to start learning.
              </div>
            )}
          </div>
        ) : mode === 'practice' ? (
          <div className="space-y-6">
            {activeTopic === 'pos' && (
              <div className="flex justify-end">
                <div className="bg-slate-200/50 p-1 rounded-xl flex gap-1 shadow-inner">
                  <button
                    onClick={() => handlePracticeModeChange('new')}
                    className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                      practiceMode === 'new' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" /> New Questions
                  </button>
                  <button
                    onClick={() => handlePracticeModeChange('retry')}
                    className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
                      practiceMode === 'retry' ? 'bg-white text-red-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" /> Retry Incorrect
                  </button>
                </div>
              </div>
            )}
            {/* Practice Mode UI */}
            {practiceLoading ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse">Generating content...</p>
              </div>
            ) : activeTopic === 'pos' ? (
              dQuestion ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                    <div className="bg-indigo-50 border-b border-indigo-100 px-8 py-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                          Word Form Root: {dWordRoot}
                        </span>
                        <div className="flex gap-2">
                          <button 
                            onClick={handlePrevious}
                            disabled={viewOffset >= maxOffset}
                            className="flex items-center gap-1 text-sm font-bold text-indigo-600 bg-white/60 hover:bg-white px-3 py-1.5 rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            title="Previous Question (Ctrl + ←)"
                          >
                            <ChevronLeft className="w-4 h-4" /> Prev
                          </button>
                          <button 
                            onClick={handleNext}
                            disabled={viewOffset === 0 && !isAnswered}
                            className="flex items-center gap-1 text-sm font-bold text-indigo-600 bg-white/60 hover:bg-white px-3 py-1.5 rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            title="Next Question (Ctrl + →)"
                          >
                            Next <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-2xl font-semibold text-slate-800 leading-relaxed">
                        {dSentence?.split('___').map((part: string, i: number, arr: string[]) => (
                          <span key={i}>
                            {part}
                            {i < arr.length - 1 && (
                              <span className={`inline-block mx-2 min-w-[120px] border-b-2 text-center pb-1 ${
                                dIsCorrectSelection
                                  ? 'border-green-500 text-green-600 font-bold'
                                  : dIsAnswered && dSelectedAnswer
                                    ? 'border-red-500 text-red-600 font-bold'
                                    : 'border-slate-300'
                              }`}>
                                {dIsAnswered ? dSelectedAnswer ?? '' : ''}
                              </span>
                            )}
                          </span>
                        ))}
                      </p>
                    </div>
                    
                    <div className="p-8">
                      <div className="grid gap-4 mb-8">
                        {dOptions?.map((opt: string, idx: number) => {
                          const isSelected = dSelectedIdx === idx;
                          const isCorrect = opt === dCorrectAnswer;
                          
                          let btnClass = "relative flex items-center justify-between p-5 rounded-2xl border-2 text-left font-semibold text-lg transition-all ";
                          if (!dIsAnswered) {
                            btnClass += "border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 cursor-pointer active:scale-[0.98]";
                          } else {
                            btnClass += "cursor-default ";
                            if (isCorrect) {
                              btnClass += "border-green-500 bg-green-50 text-green-700";
                            } else if (isSelected && !isCorrect) {
                              btnClass += "border-red-500 bg-red-50 text-red-700";
                            } else {
                              btnClass += "border-slate-200 opacity-50 bg-slate-50";
                            }
                          }
                          
                          return (
                            <button
                              key={idx}
                              onClick={() => handleSelectOption(idx)}
                              disabled={dIsAnswered}
                              className={btnClass}
                            >
                              <span>{opt}</span>
                              {dIsAnswered && isCorrect && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                              {dIsAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-500" />}
                            </button>
                          );
                        })}
                      </div>

                      {dIsAnswered && (
                        <div className="p-8 pt-0 animate-in zoom-in-95 duration-300">
                          <div className={`rounded-2xl p-6 ${dIsCorrectSelection ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-100'}`}>
                            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                              {dIsCorrectSelection 
                                ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Correct!</>
                                : <><RotateCcw className="w-5 h-5 text-amber-600" /> Explanation</>
                              }
                            </h3>
                            <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                              {dExplanation}
                            </p>
                          </div>
                          
                          {viewOffset === 0 && (
                            <button
                              onClick={handleFetchQuestion}
                              className="mt-6 w-full flex items-center justify-center py-4 rounded-full bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                            >
                              Next Question
                              <ArrowRight className="w-5 h-5 ml-2" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
              )
            ) : activeTopic === 'conversation' ? (
              !activeScenario ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                  {[
                    { id: 'At a Coffee Shop', icon: <Coffee className="w-8 h-8 text-amber-600" />, title: 'Coffee Shop', desc: 'Order drinks and make small talk.', color: 'bg-amber-50 border-amber-200' },
                    { id: 'In an Office Meeting', icon: <Briefcase className="w-8 h-8 text-blue-600" />, title: 'Office Meeting', desc: 'Discuss projects and share updates.', color: 'bg-blue-50 border-blue-200' },
                    { id: 'At the Airport', icon: <Plane className="w-8 h-8 text-sky-600" />, title: 'Airport', desc: 'Check-in, security, and directions.', color: 'bg-sky-50 border-sky-200' },
                    { id: 'Free Talk', icon: <MessageSquare className="w-8 h-8 text-indigo-600" />, title: 'Free Talk', desc: 'Chat about anything you like.', color: 'bg-indigo-50 border-indigo-200' },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleStartConversation(s.id)}
                      className={`p-6 rounded-2xl border text-left transition-all hover:shadow-md hover:scale-[1.02] ${s.color}`}
                    >
                      <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        {s.icon}
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">{s.title}</h3>
                      <p className="text-slate-600 font-medium">{s.desc}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[600px] animate-in fade-in zoom-in-95">
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-100 p-2 rounded-xl">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-800">{activeScenario}</h2>
                        <p className="text-xs text-slate-500 font-medium">Practice speaking naturally</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setActiveScenario(null); setChatMessages([]); setConversationId(null); }}
                      className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-colors"
                    >
                      Exit Chat
                    </button>
                  </div>
                  
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          {msg.role === 'assistant' ? (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-1">
                              <BrainCircuit className="w-4 h-4 text-indigo-600" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mb-1">
                              <User className="w-4 h-4 text-slate-600" />
                            </div>
                          )}
                          <div className={`px-5 py-3 rounded-2xl ${
                            msg.role === 'user' 
                              ? 'bg-gradient-to-br from-[#5a67d8] to-[#4c51bf] text-white rounded-br-sm shadow-md' 
                              : 'bg-slate-100 text-slate-800 rounded-bl-sm border border-slate-200'
                          }`}>
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                        
                        {msg.role === 'user' && msg.correction_note && (
                          <div className="mt-2 mr-10 max-w-[70%]">
                            <details className="group">
                              <summary className="flex items-center gap-1.5 text-xs font-bold text-amber-600 cursor-pointer hover:text-amber-700 select-none list-none">
                                <Lightbulb className="w-4 h-4" /> 
                                <span>Tip for natural speaking</span>
                                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                              </summary>
                              <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-slate-700 leading-relaxed shadow-sm">
                                {msg.correction_note}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex items-end gap-2 max-w-[80%]">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-1">
                          <BrainCircuit className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="px-5 py-4 rounded-2xl bg-slate-100 border border-slate-200 rounded-bl-sm flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                    <div className="flex gap-2 relative">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendChatMessage()}
                        placeholder="Type your message..."
                        disabled={chatLoading}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-full pl-6 pr-14 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                      />
                      <button
                        onClick={handleSendChatMessage}
                        disabled={chatLoading || !chatInput.trim()}
                        className="absolute right-2 top-2 bottom-2 aspect-square bg-[#5a67d8] hover:bg-[#4c51bf] text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        <Send className="w-4 h-4 ml-0.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            ) : null}
            {error && mode === 'practice' && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-center font-medium">
                {error}
                <button onClick={handleFetchQuestion} className="ml-3 underline">Try again</button>
              </div>
            )}
          </div>
        ) : mode === 'dashboard' ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex bg-white rounded-2xl shadow-sm border border-slate-200 p-1 mb-6">
              <button
                onClick={() => setDashboardTab('questions')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                  dashboardTab === 'questions' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <BookOpen className="w-5 h-5" />
                Question Bank
              </button>
              <button
                onClick={() => setDashboardTab('stats')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                  dashboardTab === 'stats' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <PieChart className="w-5 h-5" />
                History & Stats
              </button>
              <button
                onClick={() => setDashboardTab('import')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                  dashboardTab === 'import' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <UploadCloud className="w-5 h-5" />
                Import Questions
              </button>
            </div>

            {dashboardTab === 'questions' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Question Bank</h2>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">
                    {questionBank.length} questions
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[720px] overflow-y-auto">
                  {questionBank.length === 0 ? (
                    <div className="p-12 flex flex-col items-center text-center">
                      <Filter className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No questions in the bank yet.</p>
                    </div>
                  ) : (
                    questionBank.map((item) => {
                      const isExpanded = expandedBankQuestionId === item.id;

                      return (
                        <div key={item.id} className={`${isExpanded ? 'bg-slate-50' : 'bg-white'} transition-colors`}>
                          <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                    #{item.id}
                                  </span>
                                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                                    Root: {item.word_root}
                                  </span>
                                  <span className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                                    Answer: {item.correct_answer}
                                  </span>
                                </div>
                                <p className="text-lg font-semibold leading-relaxed text-slate-800">
                                  {item.sentence.replace('___', '______')}
                                </p>
                              </div>
                              <button
                                onClick={() => setExpandedBankQuestionId(isExpanded ? null : item.id)}
                                className="mt-1 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                              >
                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                              </button>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-5 border-t border-slate-200/70 pt-5">
                                    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      {item.options.filter(Boolean).map((opt, i) => {
                                        const isCorrect = opt === item.correct_answer;

                                        return (
                                          <div
                                            key={i}
                                            className={`relative flex items-center rounded-xl border p-3 text-sm font-medium ${
                                              isCorrect
                                                ? 'border-green-500 bg-green-50 text-green-700'
                                                : 'border-slate-200 bg-white text-slate-600'
                                            }`}
                                          >
                                            <span className="mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current bg-white/50 text-xs font-bold opacity-70">
                                              {String.fromCharCode(65 + i)}
                                            </span>
                                            <span>{opt}</span>
                                            {isCorrect && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-green-500" />}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="rounded-xl border border-indigo-100/70 bg-indigo-50/50 p-5">
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <h4 className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                                          <BookOpen className="h-4 w-4 text-indigo-500" />
                                          Explanation
                                        </h4>
                                        {editingExplanationQuestionId === item.id ? (
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={handleCancelEditExplanation}
                                              disabled={savingExplanationId === item.id}
                                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                              <XCircle className="h-3.5 w-3.5" />
                                              Cancel
                                            </button>
                                            <button
                                              onClick={() => handleSaveExplanation(item.id)}
                                              disabled={
                                                savingExplanationId === item.id ||
                                                !explanationDraft.trim() ||
                                                explanationDraft.trim() === item.explanation.trim()
                                              }
                                              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              {savingExplanationId === item.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              ) : (
                                                <Save className="h-3.5 w-3.5" />
                                              )}
                                              Save
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => handleStartEditExplanation(item.id, item.explanation)}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-100 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Edit
                                          </button>
                                        )}
                                      </div>

                                      {editingExplanationQuestionId === item.id ? (
                                        <textarea
                                          value={explanationDraft}
                                          onChange={(e) => setExplanationDraft(e.target.value)}
                                          rows={12}
                                          className="w-full resize-y rounded-lg border border-indigo-200 bg-white p-4 text-sm leading-relaxed text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                          spellCheck={false}
                                        />
                                      ) : (
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                                          {item.explanation}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {dashboardTab === 'stats' && stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-slate-500 font-medium mb-1">Total Questions</p>
                    <p className="text-3xl font-black text-slate-800">{stats.total_questions}</p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-slate-500 font-medium mb-1">Answered</p>
                    <p className="text-3xl font-black text-indigo-600">{stats.answered_questions}</p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-200">
                    <p className="text-green-600 font-medium mb-1">Correct</p>
                    <p className="text-3xl font-black text-green-700">{stats.correct_answers}</p>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-200">
                    <p className="text-red-600 font-medium mb-1">Incorrect</p>
                    <p className="text-3xl font-black text-red-700">{stats.incorrect_answers}</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      <h2 className="text-lg font-semibold text-slate-800">Recent History</h2>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex bg-slate-200/50 p-1 rounded-lg">
                        {(['all', 'correct', 'incorrect'] as const).map(filter => (
                          <button
                            key={filter}
                            onClick={() => setHistoryFilter(filter)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${
                              historyFilter === filter 
                                ? 'bg-white text-slate-800 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                      
                      <button
                        onClick={handleResetProgress}
                        className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                        title="Delete all progress to start over"
                      >
                        <RotateCcw className="w-4 h-4" /> Reset Progress
                      </button>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                    {filteredHistory.length === 0 ? (
                      <div className="p-12 flex flex-col items-center text-center">
                        <Filter className="w-10 h-10 text-slate-300 mb-3" />
                        <p className="text-slate-500 font-medium">No questions found for this filter.</p>
                      </div>
                    ) : (
                      filteredHistory.map((item, idx) => {
                        const isExpanded = expandedHistoryId === item.id;
                        
                        return (
                          <div 
                            key={idx} 
                            className={`group relative transition-colors ${
                              item.is_correct ? 'hover:bg-green-50/30' : 'hover:bg-red-50/30'
                            } ${isExpanded ? 'bg-slate-50' : 'bg-white'}`}
                          >
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                              item.is_correct ? 'bg-green-400' : 'bg-red-400'
                            }`} />
                            
                            <div 
                              className="p-6 cursor-pointer"
                              onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 pr-4">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                      item.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {item.is_correct ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                      {item.is_correct ? 'Correct' : 'Incorrect'}
                                    </span>
                                    <span className="text-slate-400 text-xs font-medium">
                                      {new Date(item.answered_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                  
                                  <p className="text-slate-800 font-medium text-lg leading-relaxed">
                                    {item.sentence.replace('___', '______')}
                                  </p>
                                </div>
                                <button 
                                  className="mt-1 p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-colors shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedHistoryId(isExpanded ? null : item.id);
                                  }}
                                >
                                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </button>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pt-6 mt-4 border-t border-slate-200/60">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                                        {item.options && item.options.filter(opt => opt).map((opt, i) => {
                                          const isSelected = item.selected_answer === opt;
                                          const isCorrect = item.correct_answer === opt;
                                          let btnClass = "relative flex items-center p-3 rounded-xl border text-sm font-medium transition-all duration-200 ";
                                          
                                          if (isCorrect) {
                                            btnClass += "border-green-500 bg-green-50 text-green-700 shadow-sm";
                                          } else if (isSelected) {
                                            btnClass += "border-red-500 bg-red-50 text-red-700 shadow-sm";
                                          } else {
                                            btnClass += "border-slate-200 bg-white text-slate-500";
                                          }
                                          
                                          return (
                                            <div key={i} className={btnClass}>
                                              <span className="w-6 h-6 rounded-full bg-white/50 flex items-center justify-center mr-3 text-xs font-bold border border-current opacity-70 shrink-0">
                                                {String.fromCharCode(65 + i)}
                                              </span>
                                              <span>{opt}</span>
                                              {isCorrect && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto shrink-0" />}
                                              {isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500 ml-auto shrink-0" />}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      
                                      <div
                                        className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100/50"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                          <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                            <BookOpen className="w-4 h-4 text-indigo-500" />
                                            Explanation
                                          </h4>
                                          {editingExplanationQuestionId === item.question_id ? (
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={handleCancelEditExplanation}
                                                disabled={savingExplanationId === item.question_id}
                                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                              >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Cancel
                                              </button>
                                              <button
                                                onClick={() => handleSaveExplanation(item.question_id)}
                                                disabled={
                                                  savingExplanationId === item.question_id ||
                                                  !explanationDraft.trim() ||
                                                  explanationDraft.trim() === item.explanation.trim()
                                                }
                                                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                {savingExplanationId === item.question_id ? (
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                  <Save className="w-3.5 h-3.5" />
                                                )}
                                                Save
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => handleStartEditExplanation(item.question_id, item.explanation)}
                                              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-100 bg-white px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />
                                              Edit
                                            </button>
                                          )}
                                        </div>

                                        {editingExplanationQuestionId === item.question_id ? (
                                          <textarea
                                            value={explanationDraft}
                                            onChange={(e) => setExplanationDraft(e.target.value)}
                                            rows={12}
                                            className="w-full rounded-lg border border-indigo-200 bg-white p-4 text-sm leading-relaxed text-slate-800 outline-none resize-y focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                            spellCheck={false}
                                          />
                                        ) : (
                                          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                                            {item.explanation}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {dashboardTab === 'import' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-2">
                    <UploadCloud className="w-6 h-6 text-indigo-600" />
                    Import Questions
                  </h3>
                  <p className="text-slate-500">
                    Paste raw text from TOEIC PDF or Word files. AI will automatically parse questions, options, identify the correct answer, and generate detailed explanations.
                  </p>
                </div>

                <textarea
                  rows={10}
                  placeholder="Example:
101. The new software makes it possible to track shipments more _______.
(A) exact
(B) exactly
(C) exactness
(D) exacts"
                  className="w-full rounded-xl border border-slate-300 p-4 focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm resize-y"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />

                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500 italic">
                    Tip: Import 5-10 questions at a time to avoid timeout.
                  </p>
                  <button
                    onClick={handleImport}
                    disabled={importLoading || !importText.trim()}
                    className="flex items-center justify-center px-8 py-3 rounded-full bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    {importLoading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing with AI...</>
                    ) : (
                      <><UploadCloud className="w-5 h-5 mr-2" /> Start Import</>
                    )}
                  </button>
                </div>
                {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
              </div>
            )}
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  </div>
</div>
  );
}

export default App;
