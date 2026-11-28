import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Cpu,
  ExternalLink,
  Languages,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildMessengerUrl,
  buildWhatsAppSupportUrl,
  coerceSafeErrorText,
  extractAiReplyText,
  sanitizeAiChatHistory,
  type AiHelpLangPreference,
} from '../lib/marketplace-logic';
import type { Lang, PublicAiProvider } from '../types/marketplace';

interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  providerLabel?: string;
  reasoningDetails?: unknown;
}

interface AiHelpWidgetProps {
  uiLang: Lang;
  area: string;
  viewType: string;
  activeOrderNumber?: string;
  accentColor?: string;
  messengerUrl?: string;
  whatsappNumber?: string;
  supportEmail?: string;
}

const STARTER_PROMPTS = [
  {
    id: 'unavailable',
    labelEn: 'Why does a restaurant say unavailable?',
    labelBn: 'রেস্টুরেন্ট unavailable দেখায় কেন?',
  },
  {
    id: 'track',
    labelEn: 'How to track rider GPS & ETA?',
    labelBn: 'রাইডার কোথায় আছে ও সময় কীভাবে দেখবো?',
  },
  {
    id: 'vendor',
    labelEn: 'How to open 1 restaurant & add branches?',
    labelBn: 'রেস্টুরেন্ট ও নতুন শাখা (Branch) কীভাবে যোগ করবো?',
  },
  {
    id: 'support',
    labelEn: 'How to contact support on Messenger & WhatsApp?',
    labelBn: 'Messenger ও WhatsApp সাপোর্টে কীভাবে যোগাযোগ করবো?',
  },
];

function MessengerIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.145 2 11.259c0 2.912 1.454 5.512 3.727 7.213V22l3.405-1.869c.909.252 1.87.387 2.868.387 5.523 0 10-4.145 10-9.259S17.523 2 12 2zm1.002 12.463l-2.548-2.717-4.97 2.717 5.468-5.804 2.61 2.717 4.908-2.717-5.468 5.804z" />
    </svg>
  );
}

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.51 2 2 6.49 2 12.02c0 1.77.46 3.5 1.34 5.02L2 22l5.09-1.33a10.04 10.04 0 004.95 1.3h.01c5.52 0 10.02-4.49 10.02-10.02A9.97 9.97 0 0012.04 2zm5.84 14.23c-.25.7-1.44 1.34-2 1.42-.51.08-1.15.11-1.85-.11-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.38.79-.38.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.33-.3.51-.15.18-.32.4-.45.54-.15.15-.31.31-.13.61.18.3.79 1.3 1.7 2.11 1.17 1.04 2.16 1.36 2.46 1.51.3.15.48.13.66-.08.18-.2.76-.89.96-1.19.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.35.08.13.08.73-.17 1.43z" />
    </svg>
  );
}

class AiHelpErrorBoundary extends React.Component<
  { children: React.ReactNode; uiLang: Lang },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; uiLang: Lang }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('AiHelpWidget caught render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-40">
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2.5 rounded-2xl bg-[#E21B70] text-white shadow-xl text-xs font-extrabold inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {this.props.uiLang === 'bn' ? 'লাইভ চ্যাট রিসেট করুন' : 'Reset Live Chat'}
            </span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AiHelpWidget(props: AiHelpWidgetProps) {
  return (
    <AiHelpErrorBoundary uiLang={props.uiLang}>
      <AiHelpWidgetInner {...props} />
    </AiHelpErrorBoundary>
  );
}

function AiHelpWidgetInner({
  uiLang,
  area,
  viewType,
  activeOrderNumber,
  accentColor = '#E21B70',
  messengerUrl,
  whatsappNumber,
  supportEmail = 'support@foodorabd.com',
}: AiHelpWidgetProps) {
  const [open, setOpen] = useState(false);
  const [langPref, setLangPref] = useState<AiHelpLangPreference>('auto');
  const [providers, setProviders] = useState<PublicAiProvider[]>([]);
  const [selectedProviderCode, setSelectedProviderCode] = useState<string>('foodora');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const resolvedMessengerUrl = useMemo(
    () => buildMessengerUrl(messengerUrl),
    [messengerUrl]
  );

  const whatsappPrefill = useMemo(() => {
    const orderPart = activeOrderNumber ? ` (Order: ${activeOrderNumber})` : '';
    return uiLang === 'bn'
      ? `আসসালামু আলাইকুম, Foodora BD সাপোর্টে যোগাযোগ করছি${orderPart}। এলাকা: ${area}`
      : `Hello Foodora BD Support${orderPart}, I need help from ${area}.`;
  }, [activeOrderNumber, area, uiLang]);

  const resolvedWhatsappUrl = useMemo(
    () => buildWhatsAppSupportUrl(whatsappNumber || '+8801712345678', whatsappPrefill),
    [whatsappNumber, whatsappPrefill]
  );

  const displayWhatsappNumber = (whatsappNumber || '+8801712345678').trim();

  useEffect(() => {
    const handleOpenLiveChat = () => setOpen(true);
    window.addEventListener('foodora:open-live-chat', handleOpenLiveChat);
    return () => {
      window.removeEventListener('foodora:open-live-chat', handleOpenLiveChat);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadProviders = async () => {
      try {
        const res = await apiFetch<{ providers: PublicAiProvider[] }>('/api/ai/providers');
        if (!active || !Array.isArray(res.providers) || res.providers.length === 0) return;
        const sorted = [...res.providers].sort((a, b) => {
          if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
          return (a.sortOrder ?? 10) - (b.sortOrder ?? 10);
        });
        setProviders(sorted);
        const preferred =
          sorted.find((p) => p.isDefault && p.isConfigured) ||
          sorted.find((p) => p.isConfigured) ||
          sorted[0];
        if (preferred) {
          setSelectedProviderCode((prev) =>
            sorted.some((p) => p.code === prev) ? prev : preferred.code
          );
        }
      } catch {
        // non-blocking fallback to default Foodora Own AI
      }
    };
    void loadProviders();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, sending]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const sendQuestion = async (rawText: string, overrideProviderCode?: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    const targetProvider = overrideProviderCode || selectedProviderCode;
    const shouldAppendUserMsg = !overrideProviderCode;

    if (shouldAppendUserMsg) {
      const userMsg: AiChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
    }
    setErrorMsg(null);
    setSending(true);

    try {
      const sanitizedHistory = sanitizeAiChatHistory(messages);
      const res = await apiFetch<{
        reply?: unknown;
        model?: unknown;
        providerCode?: unknown;
        providerName?: unknown;
        reasoningDetails?: unknown;
      }>('/api/ai/help', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          langPreference: langPref,
          uiLang,
          providerCode: targetProvider || undefined,
          history: sanitizedHistory,
          context: {
            area: String(area || 'Dhaka'),
            viewType: String(viewType || 'home'),
            activeOrderNumber: activeOrderNumber ? String(activeOrderNumber) : undefined,
          },
        }),
      });

      const safeReply = extractAiReplyText(res?.reply);
      if (!safeReply) {
        throw new Error(
          uiLang === 'bn'
            ? 'এই AI মডেলটি খালি উত্তর দিয়েছে। Foodora Own AI বা Pollinations Free AI ব্যবহার করে দেখুন।'
            : 'That AI model returned an empty response. Switch to Foodora Own AI or Pollinations Free AI.'
        );
      }

      const safeProviderName =
        typeof res?.providerName === 'string' ? res.providerName.trim() : '';
      const safeModelName = typeof res?.model === 'string' ? res.model.trim() : '';
      const providerLabel = safeProviderName
        ? `${safeProviderName}${safeModelName ? ` · ${safeModelName}` : ''}`
        : safeModelName || undefined;

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: safeReply,
          providerLabel,
          reasoningDetails: res?.reasoningDetails,
        },
      ]);
    } catch (err: unknown) {
      setErrorMsg(
        coerceSafeErrorText(
          err,
          uiLang === 'bn'
            ? 'AI সহায়তা পাওয়া যায়নি। নিচের ফ্রি AI বা Messenger/WhatsApp ব্যবহার করুন।'
            : 'Could not reach that AI engine. Try Foodora Own AI, Pollinations Free AI, or Messenger/WhatsApp support.'
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  const displayBn = langPref === 'bn' || (langPref === 'auto' && uiLang === 'bn');
  const activeProviderObj = providers.find((p) => p.code === selectedProviderCode);
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.text;

  return (
    <>
      {/* Single clean Foodora Live Chat launcher (Messenger & WhatsApp cleanly housed inside drawer & footer) */}
      {!open && (
        <div
          data-testid="support-dock"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-40"
        >
          <button
            type="button"
            data-testid="ai-help-launcher"
            onClick={() => setOpen(true)}
            aria-label="Open Bilingual AI Help (Bangla and English)"
            style={{ backgroundColor: accentColor }}
            className="px-4 py-2.5 rounded-2xl text-white shadow-xl hover:opacity-95 transition-all inline-flex items-center gap-2 text-xs font-extrabold"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {uiLang === 'bn' ? 'লাইভ চ্যাট · AI / বাংলা' : 'Live Chat · AI / বাংলা'}
            </span>
          </button>
        </div>
      )}

      {/* Website Live Chat + Messenger + WhatsApp Support Drawer */}
      {open && (
        <div
          data-testid="ai-help-backdrop"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/25 sm:bg-transparent flex items-end justify-end p-3 sm:p-6 pointer-events-auto"
        >
          <section
            data-testid="ai-help-panel"
            aria-label="Foodora BD Website Live Chat and Support"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:w-[430px] max-h-[86vh] sm:max-h-[650px] rounded-2xl border border-neutral-200 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div
              style={{ backgroundColor: accentColor }}
              className="px-4 py-3 text-white flex items-center justify-between gap-2 shrink-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-tight truncate">
                    {displayBn ? 'Foodora লাইভ চ্যাট ও AI সাপোর্ট' : 'Foodora Live Chat & AI Support'}
                  </h3>
                  <p className="text-[11px] text-white/85 truncate">
                    {activeProviderObj
                      ? `${activeProviderObj.name} · ${activeProviderObj.model}`
                      : displayBn
                      ? 'ওয়েব চ্যাট, Messenger এবং WhatsApp সাপোর্ট'
                      : 'Website Live Chat · Messenger · WhatsApp'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setErrorMsg(null);
                    }}
                    aria-label="Clear chat"
                    title={displayBn ? 'চ্যাট মুছুন' : 'Clear chat'}
                    className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close AI Help"
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sleek Integrated Support Channel Strip: Website Live Chat + Facebook Messenger + WhatsApp */}
            <div className="px-2.5 sm:px-3 py-2 bg-white border-b border-neutral-200 grid grid-cols-3 gap-1 sm:gap-1.5 text-[11px] shrink-0">
              <div className="px-1.5 sm:px-2 py-1.5 rounded-xl bg-[#FFF0F6] border border-[#E21B70]/25 text-[#E21B70] font-bold flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{displayBn ? 'লাইভ চ্যাট' : 'Live Chat'}</span>
              </div>

              <a
                href={resolvedMessengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="messenger-panel-link"
                className="px-1.5 sm:px-2 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-[#2E3138] font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors min-w-0"
              >
                <MessengerIcon className="w-3.5 h-3.5 shrink-0 text-[#0084FF]" />
                <span className="truncate">Messenger</span>
                <ExternalLink className="w-2.5 h-2.5 text-neutral-400 shrink-0 hidden sm:inline" />
              </a>

              <a
                href={resolvedWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="whatsapp-panel-link"
                className="px-1.5 sm:px-2 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-[#2E3138] font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors min-w-0"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 shrink-0 text-[#16A34A]" />
                <span className="truncate">WhatsApp</span>
                <ExternalLink className="w-2.5 h-2.5 text-neutral-400 shrink-0 hidden sm:inline" />
              </a>
            </div>

            {/* Language Mode & AI Model Selector Bar */}
            <div className="px-3.5 py-2 bg-[#FAFAFB] border-b border-neutral-200 space-y-1.5 text-[11px] shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-neutral-600">
                  <Languages className="w-3.5 h-3.5 text-[#E21B70]" />
                  <span>{displayBn ? 'উত্তরের ভাষা:' : 'Reply Language:'}</span>
                </span>
                <div
                  role="group"
                  aria-label="AI Help reply language"
                  className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5"
                >
                  {(
                    [
                      { key: 'auto', label: 'Auto' },
                      { key: 'bn', label: 'বাংলা' },
                      { key: 'en', label: 'EN' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setLangPref(opt.key)}
                      className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                        langPref === opt.key
                          ? 'bg-[#E21B70] text-white'
                          : 'text-neutral-600 hover:text-[#2E3138]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {providers.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-semibold text-neutral-600 shrink-0">
                    <Cpu className="w-3.5 h-3.5 text-[#E21B70]" />
                    <span>{displayBn ? 'AI ইঞ্জিন:' : 'AI Engine:'}</span>
                  </span>
                  <select
                    aria-label="Select AI Help engine"
                    value={selectedProviderCode}
                    onChange={(e) => {
                      setSelectedProviderCode(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="flex-1 min-w-0 max-w-[260px] px-2 py-1 rounded-lg border border-neutral-200 bg-white text-[11px] font-semibold text-[#2E3138]"
                  >
                    {providers.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} ({p.model}){!p.isConfigured ? ' — Needs Key' : ' ✓ Ready'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#FAFAFB]">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-700 leading-relaxed space-y-1.5">
                    <p className="font-bold text-[#2E3138]">
                      {displayBn
                        ? 'স্বাগতম! লাইভ চ্যাট বা সরাসরি Messenger / WhatsApp-এ সাহায্য নিন'
                        : 'Welcome! Chat live here or reach us on Messenger & WhatsApp'}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {displayBn
                        ? 'অর্ডার, রাইডার ট্র্যাকিং, রেস্টুরেন্ট ব্রাঞ্চ, বা পেমেন্ট নিয়ে প্রশ্ন লিখুন — অথবা উপরের Messenger ও WhatsApp বাটনে সরাসরি মেসেজ করুন।'
                        : 'Ask AI here in Bangla/English about orders, rider tracking, restaurant branches, or payments — or tap Messenger & WhatsApp above for human support.'}
                    </p>
                    <div className="pt-1.5 border-t border-neutral-100 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                      <a
                        href={resolvedWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        <span>WhatsApp: {displayWhatsappNumber}</span>
                      </a>
                      <a
                        href={`mailto:${supportEmail}`}
                        className="inline-flex items-center gap-1 font-semibold text-neutral-600 hover:text-[#E21B70]"
                      >
                        <Mail className="w-3 h-3" />
                        <span>{supportEmail}</span>
                      </a>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-neutral-500 px-0.5">
                      {displayBn ? 'জনপ্রিয় প্রশ্ন:' : 'Quick Help Questions:'}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {STARTER_PROMPTS.map((q) => {
                        const text = displayBn ? q.labelBn : q.labelEn;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => void sendQuestion(text)}
                            className="text-left px-3 py-2 rounded-xl bg-white border border-neutral-200 hover:border-[#E21B70] hover:bg-[#FFF0F6]/50 text-xs font-semibold text-[#2E3138] transition-colors"
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  const safeText = extractAiReplyText(m.text) || String(m.text ?? '');
                  const safeProviderLabel =
                    typeof m.providerLabel === 'string' ? m.providerLabel : '';
                  return (
                    <div
                      key={m.id}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        data-testid={
                          m.role === 'assistant' ? 'ai-assistant-message' : 'ai-user-message'
                        }
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          m.role === 'user'
                            ? 'bg-[#E21B70] text-white rounded-br-sm'
                            : 'bg-white border border-neutral-200 text-[#2E3138] rounded-bl-sm shadow-2xs'
                        }`}
                      >
                        <p>
                          {safeText.split(/(\*\*[^*\n]+\*\*)/g).map((part, idx) =>
                            part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
                              <strong key={idx} className="font-bold text-[#2E3138]">
                                {part.slice(2, -2)}
                              </strong>
                            ) : (
                              <React.Fragment key={idx}>{part}</React.Fragment>
                            )
                          )}
                        </p>
                        {safeProviderLabel && (
                          <p className="mt-1.5 pt-1 border-t border-neutral-100 text-[10px] text-neutral-400">
                            {safeProviderLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-neutral-200 text-xs text-neutral-500 inline-flex items-center gap-2 shadow-2xs">
                    <span className="font-semibold text-[#E21B70]">
                      {displayBn ? 'Foodora AI উত্তর লিখছে' : 'Foodora AI is thinking'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E21B70] animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E21B70] animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E21B70] animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderCode('foodora');
                        setErrorMsg(null);
                        if (lastUserMessage) {
                          void sendQuestion(lastUserMessage, 'foodora');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#E21B70] text-white text-[11px] font-bold hover:opacity-95"
                    >
                      {displayBn ? 'Foodora Own AI দিয়ে উত্তর পান' : 'Use Foodora Own AI'}
                    </button>
                    {providers.some((p) => p.code === 'pollinations') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProviderCode('pollinations');
                          setErrorMsg(null);
                          if (lastUserMessage) {
                            void sendQuestion(lastUserMessage, 'pollinations');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-red-200 text-[#2E3138] text-[11px] font-bold hover:border-[#E21B70]"
                      >
                        {displayBn ? 'Pollinations Free AI ব্যবহার করুন' : 'Use Pollinations Free AI'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div ref={listEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSubmit}
              className="p-2.5 bg-white border-t border-neutral-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  displayBn
                    ? 'বাংলা বা ইংরেজিতে প্রশ্ন লিখুন...'
                    : 'Ask in Bangla or English...'
                }
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-[#E21B70]"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send help question"
                style={{ backgroundColor: accentColor }}
                className="px-3 py-2 rounded-xl text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{displayBn ? 'পাঠান' : 'Send'}</span>
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
