import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your StockWise AI Assistant. Ask me about sales, inventory, customers, business performance, or demand forecasts.",
  meta: { readOnly: true },
};

const SUGGESTED_QUESTIONS = [
  "Summarize today's sales",
  'Which products are low on stock?',
  "Show this month's revenue and profit",
  'What should I reorder?',
  'How does demand forecasting work?',
];

const SESSION_STORAGE_KEY = 'stockwise_chat_history_v1';

function loadSessionMessages() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (_) {}
  return [WELCOME_MESSAGE];
}

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(loadSessionMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState('');
  const scrollEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch (_) {}
  }, [messages]);

  useEffect(() => {
    if (isOpen && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, sending]);

  useEffect(() => {
    if (!isOpen) return;
    if (inputRef.current) {
      inputRef.current.focus();
    }
    if (!statusInfo) {
      api
        .get('/chat/status')
        .then(res => setStatusInfo(res.data))
        .catch(() => {});
    }
  }, [isOpen, statusInfo]);

  const sendPrompt = async (promptText) => {
    const trimmed = String(promptText || '').trim();
    if (!trimmed || sending) return;

    setLastFailedPrompt('');
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const historyPayload = messages
      .filter(m => m.id !== 'welcome' && (m.role === 'user' || m.role === 'assistant') && !m.isError)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const { data } = await api.post('/chat', {
        message: trimmed,
        history: historyPayload,
      });

      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'Completed request.',
          meta: data.context || null,
          configured: data.configured !== false,
        },
      ]);
    } catch (err) {
      const status = err.response?.status;
      const serverReply = err.response?.data?.reply || err.response?.data?.message;
      const isUnconfigured = status === 503 && err.response?.data?.configured === false;

      if (!isUnconfigured) {
        setLastFailedPrompt(trimmed);
      }

      setMessages(prev => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: 'assistant',
          content:
            serverReply ||
            'Unable to reach the StockWise AI Assistant right now. Please check your connection or try again.',
          isError: !isUnconfigured,
          isConfigNotice: isUnconfigured,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendPrompt(input);
  };

  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setLastFailedPrompt('');
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {/* Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="StockWise AI Assistant"
          onKeyDown={e => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          className="mb-3 w-[calc(100vw-2.5rem)] sm:w-[395px] h-[540px] max-h-[calc(100vh-6rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#111827] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-blue-600 grid place-items-center text-sm font-bold shadow-sm">
                ✦
              </span>
              <div>
                <div className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <span>StockWise AI Assistant</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-blue-200 font-medium">
                    Read-Only
                  </span>
                </div>
                <div className="text-[10px] text-slate-300">
                  {statusInfo?.configured === false
                    ? 'Configuration required (AI_API_KEY)'
                    : 'Live PostgreSQL & Holt Forecast Grounded'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearChat}
                title="Reset conversation"
                aria-label="Reset conversation"
                className="text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Assistant"
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 grid place-items-center transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Unconfigured Provider Notice Banner */}
          {statusInfo && statusInfo.configured === false && (
            <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 text-[11px] text-amber-800">
              <strong>Setup Notice:</strong> External LLM key (<code className="font-mono">AI_API_KEY</code>) is not configured in <code className="font-mono">server/.env</code>.
            </div>
          )}

          {/* Conversation History */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : m.isError
                      ? 'bg-red-50 border border-red-200 text-red-700 rounded-bl-sm'
                      : m.isConfigNotice
                      ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-sm'
                      : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  <div>{m.content}</div>
                  {m.meta?.toolsUsed?.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                      <span>Verified via PostgreSQL:</span>
                      {m.meta.toolsUsed.map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Suggested Questions */}
            {messages.length <= 2 && !sending && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400 px-1">
                  Suggested questions:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_QUESTIONS.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendPrompt(q)}
                      className="text-left text-[11px] bg-white hover:bg-blue-50 text-blue-700 border border-blue-200/80 rounded-xl px-2.5 py-1.5 font-medium transition shadow-sm"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Typing / Loading Indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-slate-500 shadow-sm flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <span>Checking live StockWise AI data...</span>
                </div>
              </div>
            )}

            {/* Retry button on failed request */}
            {lastFailedPrompt && !sending && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => sendPrompt(lastFailedPrompt)}
                  className="text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded-xl transition"
                >
                  ↻ Retry last question
                </button>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={1000}
              placeholder="Ask about sales, stock, invoices, or forecasts..."
              aria-label="Ask StockWise AI Assistant"
              disabled={sending}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close StockWise AI Assistant' : 'Open StockWise AI Assistant'}
        aria-expanded={isOpen}
        className="ml-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition font-bold text-xs"
      >
        <span className="text-base leading-none">✦</span>
        <span>{isOpen ? 'Close Assistant' : 'AI Assistant'}</span>
      </button>
    </div>
  );
}
