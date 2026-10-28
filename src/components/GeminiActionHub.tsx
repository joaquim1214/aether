import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ArrowUp,
  ArrowUpRight,
  Trash2,
  Calendar,
  Trophy,
  ShoppingBag,
  Bookmark,
  CheckSquare,
  Play,
  Pause,
  ExternalLink,
  Music,
  Film,
  Clock,
} from 'lucide-react';
import {
  ChatMessage,
  SkillItem,
  VaultItem,
  WishlistItem,
  ScheduleBlock,
  AssistantActionRecord,
  TabId,
} from '../types/lifeOs';
import {
  parseNaturalLanguageCommand,
  buildContextualReply,
} from '../services/assistantParser';

interface GeminiActionHubProps {
  isOpen: boolean;
  onClose: () => void;
  skills: SkillItem[];
  vault: VaultItem[];
  wishlist: WishlistItem[];
  extraSavingsPool: number;
  schedule: ScheduleBlock[];
  isGoogleCalendarConnected: boolean;
  isFirestoreConnected: boolean;
  onExecuteAction: (action: {
    name: string;
    args: any;
  }) => Promise<AssistantActionRecord | null>;
  onNavigateTab: (tab: TabId) => void;
}

export type AssistantVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    content:
      '¿Qué quieres guardar o agendar hoy? Puedo registrar películas, música de Spotify, entrenamientos o eventos en tu calendario.',
    timestamp: 'Ahora',
  },
];

const QUICK_PROMPTS = [
  'Guarda la película Interstellar con nota 9.5 en la Bóveda',
  'Añade el álbum Random Access Memories de Daft Punk a mi música',
  'Regístrame 45 minutos de práctica de básquet con 3 triples anotados y +50 XP',
  'Agéndame un partido de fútbol este viernes a las 6 pm',
];

const LIVE_WAVE_BARS = [
  { delay: '0s', idleH: 8, activeH: 16, tone: 'lavender' },
  { delay: '0.12s', idleH: 12, activeH: 24, tone: 'charcoal' },
  { delay: '0.24s', idleH: 14, activeH: 28, tone: 'lavender' },
  { delay: '0.08s', idleH: 11, activeH: 22, tone: 'charcoal' },
  { delay: '0.18s', idleH: 8, activeH: 16, tone: 'lavender' },
] as const;

export const GeminiActionHub: React.FC<GeminiActionHubProps> = ({
  isOpen,
  onClose,
  skills,
  vault,
  wishlist,
  extraSavingsPool,
  schedule,
  onExecuteAction,
  onNavigateTab,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const aiState: AssistantVoiceState = isListening
    ? 'listening'
    : isLoading
    ? 'thinking'
    : isSpeaking || Boolean(playingUrl)
    ? 'speaking'
    : 'idle';

  const isWaveActive = aiState !== 'idle' || input.trim().length > 0;

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingUrl(null);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      setIsSpeaking(false);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (speakingTimerRef.current) {
        window.clearTimeout(speakingTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const triggerAssistantSpeakingWave = (replyText: string) => {
    if (speakingTimerRef.current) {
      window.clearTimeout(speakingTimerRef.current);
    }
    setIsSpeaking(true);
    const durationMs = Math.min(4200, Math.max(2200, replyText.length * 28));
    speakingTimerRef.current = window.setTimeout(() => {
      setIsSpeaking(false);
    }, durationMs);
  };

  const toggleVoiceCapture = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      try {
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'es-ES';
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          setInput(transcript);
          if (event.results[0]?.isFinal && transcript.trim()) {
            setIsListening(false);
            handleSend(transcript.trim());
          }
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        // Fallback when microphone permission is restricted in iframe
      }
    }

    setIsListening(true);
    speakingTimerRef.current = window.setTimeout(() => {
      setIsListening(false);
    }, 3200);
  };

  const toggleMiniPreview = (previewUrl?: string) => {
    if (!previewUrl) return;
    if (playingUrl === previewUrl && audioRef.current) {
      audioRef.current.pause();
      setPlayingUrl(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(previewUrl);
    audio.volume = 0.85;
    audio.onended = () => setPlayingUrl(null);
    audio.onerror = () => setPlayingUrl(null);
    audioRef.current = audio;
    setPlayingUrl(previewUrl);
    audio.play().catch(() => setPlayingUrl(null));
  };

  const getActionIcon = (name: string, spotifyUrl?: string) => {
    if (spotifyUrl) return <Music className="w-4 h-4 text-[#141519]" />;
    switch (name) {
      case 'addVaultItem':
        return <Film className="w-4 h-4 text-[#141519]" />;
      case 'updateOrCreateSkill':
      case 'updateSkillProgress':
        return <Trophy className="w-4 h-4 text-[#141519]" />;
      case 'manageWishlist':
      case 'addWishlistItem':
        return <ShoppingBag className="w-4 h-4 text-[#141519]" />;
      case 'scheduleCalendarEvent':
      case 'addScheduleBlock':
        return <Calendar className="w-4 h-4 text-[#141519]" />;
      case 'createGoogleTask':
        return <CheckSquare className="w-4 h-4 text-[#141519]" />;
      default:
        return <Bookmark className="w-4 h-4 text-[#141519]" />;
    }
  };

  const handleSend = async (promptText?: string) => {
    const textToSend = (promptText ?? input).trim();
    if (!textToSend || isLoading) return;

    setIsListening(false);
    setIsSpeaking(false);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput('');
    setIsLoading(true);

    try {
      let rawActions: Array<{ name: string; args: any }> = [];
      let assistantReply = '';

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            contextState: {
              skills: skills.map((s) => ({
                name: s.name,
                branch: s.branch,
                level: s.level,
                progress: s.progress,
                hours: s.hoursInvested,
              })),
              vaultCount: vault.length,
              wishlistCount: wishlist.length,
              extraSavingsPool,
              scheduleToday: schedule.map((b) => ({
                title: b.title,
                time: b.time,
                dayOfMonth: b.dayOfMonth,
              })),
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          rawActions = Array.isArray(data.actions) ? data.actions : [];
          assistantReply = data.reply || '';
        } else {
          rawActions = parseNaturalLanguageCommand(textToSend, { skills });
          assistantReply = buildContextualReply(rawActions);
        }
      } catch {
        rawActions = parseNaturalLanguageCommand(textToSend, { skills });
        assistantReply = buildContextualReply(rawActions);
      }

      if (rawActions.length === 0) {
        rawActions = parseNaturalLanguageCommand(textToSend, { skills });
        if (!assistantReply) {
          assistantReply = buildContextualReply(rawActions);
        }
      }

      const executedRecords: AssistantActionRecord[] = [];
      for (const act of rawActions) {
        const record = await onExecuteAction(act);
        if (record) {
          executedRecords.push(record);
        }
      }

      const finalReplyText =
        assistantReply ||
        (executedRecords.length > 0
          ? '¡Listo, guardado en Aether!'
          : 'Solicitud procesada.');

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: finalReplyText,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        actionsTaken: executedRecords,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      triggerAssistantSpeakingWave(finalReplyText);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'No pude completar la acción en este momento. Inténtalo de nuevo.',
          timestamp: 'Ahora',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getWaveAnimClass = () => {
    if (aiState === 'listening') return 'aether-vbar-listening';
    if (aiState === 'thinking') return 'aether-vbar-thinking';
    if (aiState === 'speaking') return 'aether-vbar-speaking';
    if (input.trim().length > 0) return 'aether-vbar-thinking';
    return 'aether-vbar-idle';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FFFFFF] rounded-[28px] w-full max-w-lg border border-[#EEF1F5] shadow-[0_24px_60px_-12px_rgba(20,21,25,0.22)] overflow-hidden flex flex-col max-h-[86vh]">
        {/* Cabecera ultra limpia: solo título discreto y cierre */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <span className="text-[0.95rem] font-bold text-[#141519] tracking-tight">
            Aether Assistant
          </span>

          <div className="flex items-center gap-1.5">
            {messages.length > 1 && (
              <button
                onClick={() => setMessages(INITIAL_MESSAGES)}
                title="Limpiar historial"
                className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] flex items-center justify-center text-[#6E7480] transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar asistente"
              className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#141519] hover:text-[#FFFFFF] flex items-center justify-center text-[#6E7480] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Historial de Chat Limpio */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
          {/* Sugerencias iniciales solo cuando no hay conversación activa */}
          {messages.length === 1 && (
            <div className="flex flex-wrap gap-2 pb-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-2xl bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.74rem] font-medium text-[#6E7480] hover:text-[#141519] text-left transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[90%] rounded-[22px] px-4 py-3 text-[0.875rem] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#141519] text-[#FFFFFF] rounded-br-[6px]'
                    : 'bg-[#F7F9FB] text-[#141519] border border-[#EEF1F5] rounded-bl-[6px]'
                }`}
              >
                <p className="font-medium whitespace-pre-line">{msg.content}</p>

                {/* Tarjetas Soft Bento en Miniatura */}
                {msg.actionsTaken && msg.actionsTaken.length > 0 && (
                  <div className="mt-3 space-y-2.5">
                    {msg.actionsTaken.map((action, idx) => {
                      const isMint = action.accent !== 'lavender';
                      const isPlayingThis =
                        Boolean(action.audioPreviewUrl) &&
                        playingUrl === action.audioPreviewUrl;

                      return (
                        <div
                          key={`${action.name}-${idx}`}
                          className="rounded-[20px] p-3.5 text-[#141519] transition-all shadow-[0_4px_20px_-4px_rgba(19,25,39,0.05)]"
                          style={{
                            background: isMint
                              ? 'linear-gradient(135deg, #98E2DE 0%, #CDF4F2 50%, #A2E5E1 100%)'
                              : 'linear-gradient(135deg, #AEBDF6 0%, #DAE2FC 50%, #B5C2F7 100%)',
                            border: '2px solid rgba(255, 255, 255, 0.75)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {action.imageUrl ? (
                                <img
                                  src={action.imageUrl}
                                  alt={action.title || action.summary}
                                  className="w-12 h-12 rounded-[14px] object-cover border border-white/80 shadow-xs shrink-0 bg-white"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-[14px] bg-[#FFFFFF] flex items-center justify-center shadow-xs shrink-0 border border-white/80">
                                  {getActionIcon(action.name, action.spotifyUrl)}
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap text-[0.68rem] font-bold text-[#141519]/80">
                                  <span>{action.badgeText || 'Guardado'}</span>
                                  {action.secondaryBadge && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{action.secondaryBadge}</span>
                                    </>
                                  )}
                                </div>
                                <h4 className="text-[0.92rem] font-bold text-[#141519] truncate mt-0.5">
                                  {action.title || action.summary}
                                </h4>
                                {action.subtitle && (
                                  <p className="text-[0.73rem] font-medium text-[#141519]/75 truncate">
                                    {action.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            {action.targetModule && (
                              <button
                                onClick={() => {
                                  onNavigateTab(action.targetModule!);
                                  onClose();
                                }}
                                className="px-2.5 py-1.5 rounded-full bg-[#141519] text-[#FFFFFF] text-[0.68rem] font-semibold flex items-center gap-1 hover:bg-[#2A2C34] transition-colors cursor-pointer shrink-0"
                              >
                                <span>Ver</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {action.tags && action.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[0.68rem] font-semibold text-[#141519]/75">
                              {action.tags.slice(0, 4).map((tag, tIdx) => (
                                <React.Fragment key={tag}>
                                  {tIdx > 0 && <span aria-hidden="true">·</span>}
                                  <span>{tag}</span>
                                </React.Fragment>
                              ))}
                            </div>
                          )}

                          {action.details && (
                            <p className="text-[0.72rem] font-medium text-[#141519]/80 mt-2 line-clamp-2">
                              {action.details}
                            </p>
                          )}

                          {(action.audioPreviewUrl || action.spotifyUrl) && (
                            <div className="mt-2.5 pt-2 border-t border-white/40 flex items-center justify-between gap-2">
                              {action.audioPreviewUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleMiniPreview(action.audioPreviewUrl)
                                  }
                                  className="px-3 py-1 rounded-full bg-[#141519] text-[#FFFFFF] text-[0.68rem] font-semibold inline-flex items-center gap-1.5 hover:bg-[#2A2C34] transition-colors cursor-pointer"
                                >
                                  {isPlayingThis ? (
                                    <>
                                      <Pause className="w-3 h-3 fill-current" />
                                      <span>Pausar 30s</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3 h-3 fill-current" />
                                      <span>Escuchar 30s</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-[0.66rem] font-semibold text-[#141519]/70 inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Spotify
                                </span>
                              )}

                              {action.spotifyUrl && (
                                <a
                                  href={action.spotifyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1 rounded-full bg-white/80 hover:bg-white text-[#141519] text-[0.68rem] font-bold inline-flex items-center gap-1 transition-colors"
                                >
                                  <span>Abrir en Spotify</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}

                          {typeof action.progressPct === 'number' && (
                            <div className="mt-2.5">
                              <div className="flex items-center justify-between text-[0.66rem] font-bold text-[#141519]/80 mb-1">
                                <span>
                                  {action.progressLabel || 'Progreso'}
                                </span>
                                <span>{Math.min(100, action.progressPct)}%</span>
                              </div>
                              <div
                                className="w-full h-2 rounded-full overflow-hidden p-0.5"
                                style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.38)',
                                }}
                              >
                                <div
                                  className="h-full rounded-full bg-[#FFFFFF] transition-all duration-500"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(8, action.progressPct)
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Barra Inferior Flotante y Unificada estilo Gemini Live */}
        <div className="px-5 pb-5 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className={`flex items-center gap-3 p-2 rounded-[26px] bg-[#F7F9FB] border transition-all duration-300 shadow-[0_8px_28px_-6px_rgba(20,21,25,0.08)] ${
              isWaveActive
                ? 'border-[#BBC6F8] bg-[#FFFFFF]'
                : 'border-[#EEF1F5]'
            }`}
          >
            {/* Orbe / Ecualizador de Ondas de Voz a la Izquierda (Estilo Gemini Live) */}
            <button
              type="button"
              onClick={toggleVoiceCapture}
              title={
                isListening
                  ? 'Detener voz'
                  : 'Activar voz estilo Gemini Live'
              }
              aria-label="Control de voz Gemini Live"
              className="relative w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95 overflow-hidden"
              style={{
                background: isWaveActive
                  ? 'linear-gradient(135deg, #AEBDF6 0%, #DAE2FC 55%, #98E2DE 100%)'
                  : 'linear-gradient(135deg, rgba(187,198,248,0.45) 0%, rgba(243,246,248,0.9) 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.9)',
              }}
            >
              {/* Halo suave de fondo cuando está escuchando, pensando o hablando */}
              {isWaveActive && (
                <span
                  className="absolute inset-0 rounded-full aether-orb-halo-ring"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(187,198,248,0.65) 0%, rgba(20,21,25,0) 75%)',
                  }}
                />
              )}

              {/* Ecualizador orgánico de 5 barras fluidas */}
              <div className="relative z-10 flex items-center justify-center gap-[3px] h-6">
                {LIVE_WAVE_BARS.map((bar, idx) => (
                  <span
                    key={idx}
                    className={`w-[3px] rounded-full aether-vbar ${getWaveAnimClass()}`}
                    style={{
                      height: `${isWaveActive ? bar.activeH : bar.idleH}px`,
                      background:
                        bar.tone === 'charcoal'
                          ? '#141519'
                          : isWaveActive
                          ? '#141519'
                          : '#7A8499',
                      animationDelay: bar.delay,
                    }}
                  />
                ))}
              </div>
            </button>

            {/* Campo de entrada limpio sin ruido visual */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening
                  ? 'Escuchando...'
                  : isLoading
                  ? 'Procesando...'
                  : 'Habla o escribe a Aether...'
              }
              className="flex-1 bg-transparent py-2 text-[0.9rem] font-medium text-[#141519] placeholder-[#A0A6B2] focus:outline-none"
            />

            {/* Botón de envío circular en negro carbón */}
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Enviar mensaje"
              className="w-10 h-10 rounded-full bg-[#141519] hover:bg-[#2A2C34] disabled:opacity-25 text-[#FFFFFF] flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
