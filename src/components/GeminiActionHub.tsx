import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Mic,
  Check,
  History,
  Plus,
  MessageSquare,
} from 'lucide-react';
import {
  AssistantConversation,
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
  conversations: AssistantConversation[];
  onSaveConversation: (conv: AssistantConversation) => Promise<void> | void;
  onDeleteConversation: (convId: string) => Promise<void> | void;
  onExecuteAction: (action: {
    name: string;
    args: any;
  }) => Promise<AssistantActionRecord | null>;
  onNavigateTab: (tab: TabId) => void;
}

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

const BAR_COUNT = 34;

// Precomputed organic envelope & animation delays for the 34 vertical equalizer lines
const EQUALIZER_BARS = Array.from({ length: BAR_COUNT }, (_, idx) => {
  const norm = Math.abs(idx - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  const envelope = Math.max(0.25, Math.cos(norm * Math.PI * 0.48));
  const activeHeight = Math.round(8 + envelope * 20);
  const delay = `${((idx * 0.05) % 0.55).toFixed(2)}s`;
  const isAccent = idx % 3 === 0;
  return {
    idx,
    envelope,
    activeHeight,
    delay,
    isAccent,
  };
});

function formatRelativeSessionDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Reciente';
    const now = new Date();
    const isSameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isSameDay) {
      return `Hoy · ${d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return 'Reciente';
  }
}

export const GeminiActionHub: React.FC<GeminiActionHubProps> = ({
  isOpen,
  onClose,
  skills,
  vault,
  wishlist,
  extraSavingsPool,
  schedule,
  conversations,
  onSaveConversation,
  onDeleteConversation,
  onExecuteAction,
  onNavigateTab,
}) => {
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => `conv-${Date.now()}`
  );
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Voice Mode states
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [liveLevels, setLiveLevels] = useState<number[] | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const speechActivityTimeoutRef = useRef<number | null>(null);
  const aiSpeakingTimerRef = useRef<number | null>(null);
  const voiceDraftRef = useRef<string>('');
  const isSubmittingRef = useRef<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Equalizer lines ONLY animate when the user is actively speaking or the AI is emitting spoken response
  const isAudioWaveDancing = isUserSpeaking || isAiSpeaking;

  // Show the equalizer bar in the center when Voice Mode is active OR when AI is speaking its response
  const showEqualizerInCenter = isVoiceMode || isAiSpeaking;

  const cleanupVoiceResources = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (speechActivityTimeoutRef.current) {
      window.clearTimeout(speechActivityTimeoutRef.current);
      speechActivityTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLiveLevels(null);
    setIsUserSpeaking(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingUrl(null);
      }
      cleanupVoiceResources();
      setIsVoiceMode(false);
      setIsAiSpeaking(false);
      setIsHistoryOpen(false);
      voiceDraftRef.current = '';
    }
  }, [messages, isOpen, cleanupVoiceResources]);

  useEffect(() => {
    return () => {
      cleanupVoiceResources();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (aiSpeakingTimerRef.current) {
        window.clearTimeout(aiSpeakingTimerRef.current);
      }
    };
  }, [cleanupVoiceResources]);

  if (!isOpen) return null;

  const handleStartNewSession = () => {
    setActiveConversationId(`conv-${Date.now()}`);
    setMessages(INITIAL_MESSAGES);
    setIsHistoryOpen(false);
    setInput('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleSelectConversation = (conv: AssistantConversation) => {
    setActiveConversationId(conv.id);
    setMessages(
      Array.isArray(conv.messages) && conv.messages.length > 0
        ? conv.messages
        : INITIAL_MESSAGES
    );
    setIsHistoryOpen(false);
  };

  const pulseSpeechActivity = (durationMs = 650) => {
    setIsUserSpeaking(true);
    if (speechActivityTimeoutRef.current) {
      window.clearTimeout(speechActivityTimeoutRef.current);
    }
    speechActivityTimeoutRef.current = window.setTimeout(() => {
      setIsUserSpeaking(false);
    }, durationMs);
  };

  const startWebAudioMonitor = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);

        // Compute average voice energy in human speech bins
        let sum = 0;
        const binLimit = Math.min(20, dataArray.length);
        for (let i = 1; i < binLimit; i++) {
          sum += dataArray[i];
        }
        const avg = sum / Math.max(1, binLimit - 1);

        // Threshold: only animate bars when actual voice sound is present
        if (avg > 14) {
          setIsUserSpeaking(true);
          const mapped = EQUALIZER_BARS.map((bar, idx) => {
            const binIdx = (idx % Math.max(1, binLimit - 2)) + 1;
            const normLevel = Math.min(1, dataArray[binIdx] / 215);
            return Math.max(
              4,
              Math.round(4 + normLevel * 24 * bar.envelope)
            );
          });
          setLiveLevels(mapped);
        } else {
          setIsUserSpeaking(false);
          setLiveLevels(null);
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // If microphone stream access is blocked by iframe policy, SpeechRecognition events handle speaking state
    }
  };

  const startVoiceMode = () => {
    // Clear any existing input text and enter Gemini Voice Bar mode
    setInput('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    voiceDraftRef.current = '';
    setIsAiSpeaking(false);
    setIsVoiceMode(true);
    setIsUserSpeaking(false);

    startWebAudioMonitor();

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      try {
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'es-ES';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onspeechstart = () => {
          pulseSpeechActivity(900);
        };

        recognition.onspeechend = () => {
          setIsUserSpeaking(false);
        };

        recognition.onresult = (event: any) => {
          if (isSubmittingRef.current) return;
          pulseSpeechActivity(700);

          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          voiceDraftRef.current = transcript.trim();
        };

        recognition.onerror = () => {
          setIsUserSpeaking(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Ignore if already started or unsupported
      }
    }
  };

  const cancelVoiceMode = () => {
    cleanupVoiceResources();
    voiceDraftRef.current = '';
    setInput('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setIsVoiceMode(false);
    setIsAiSpeaking(false);
  };

  const finishAndSendVoice = () => {
    const capturedText = voiceDraftRef.current.trim();
    cleanupVoiceResources();
    voiceDraftRef.current = '';
    setInput('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setIsVoiceMode(false);

    if (capturedText) {
      handleSend(capturedText);
    }
  };

  const triggerAssistantSpeakingWave = (replyText: string) => {
    if (aiSpeakingTimerRef.current) {
      window.clearTimeout(aiSpeakingTimerRef.current);
    }
    setIsAiSpeaking(true);
    const durationMs = Math.min(2800, Math.max(1600, replyText.length * 20));
    aiSpeakingTimerRef.current = window.setTimeout(() => {
      setIsAiSpeaking(false);
    }, durationMs);
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
    const rawValue =
      promptText !== undefined
        ? promptText
        : inputRef.current?.value ?? input;
    const textToSend = rawValue.trim();
    if (!textToSend || isLoading) return;

    // Immediately clean up input and voice state so nothing stays stuck in the box
    isSubmittingRef.current = true;
    cleanupVoiceResources();
    voiceDraftRef.current = '';
    setInput('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setIsVoiceMode(false);
    setIsAiSpeaking(false);
    setIsHistoryOpen(false);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const nextMessagesWithUser = [...messages, userMsg];
    setMessages(nextMessagesWithUser);
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
              recentHistory: messages
                .filter((m) => m.id !== 'msg-welcome')
                .slice(-6)
                .map((m) => ({
                  role: m.role,
                  content: m.content,
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

      const completeThread = [...nextMessagesWithUser, assistantMsg];
      setMessages(completeThread);
      triggerAssistantSpeakingWave(finalReplyText);

      // Persist conversation session to Firestore / local state
      const existingConv = conversations.find(
        (c) => c.id === activeConversationId
      );
      const firstUserMsg = completeThread.find((m) => m.role === 'user');
      const rawTitle = existingConv?.title || firstUserMsg?.content || textToSend;
      const cleanTitle =
        rawTitle.length > 44 ? `${rawTitle.slice(0, 44)}...` : rawTitle;

      const updatedConv: AssistantConversation = {
        id: activeConversationId,
        title: cleanTitle,
        updatedAt: new Date().toISOString(),
        messages: completeThread,
      };
      await onSaveConversation(updatedConv);
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
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FFFFFF] rounded-[28px] w-full max-w-lg border border-[#EEF1F5] shadow-[0_24px_60px_-12px_rgba(20,21,25,0.22)] overflow-hidden flex flex-col max-h-[86vh]">
        {/* Cabecera limpia con acceso a Historial de Conversaciones y Nueva Sesión */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[0.95rem] font-bold text-[#141519] tracking-tight truncate">
              Aether Assistant
            </span>

            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              title="Historial de conversaciones guardadas"
              className={`h-7 px-2.5 rounded-full text-[0.72rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                isHistoryOpen
                  ? 'bg-[#141519] text-[#FFFFFF]'
                  : 'bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial</span>
              {conversations.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[0.65rem] font-bold tabular-nums ${
                    isHistoryOpen
                      ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text'
                      : 'bg-[#EBF0F5] text-[#141519]'
                  }`}
                >
                  {conversations.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleStartNewSession}
              title="Iniciar nueva conversación limpia"
              className="h-8 px-3 rounded-full bg-[#F7F9FB] hover:bg-[#A8E6E3]/45 border border-[#EEF1F5] text-[0.72rem] font-bold text-[#141519] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Cerrar asistente"
              className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#141519] hover:text-[#FFFFFF] flex items-center justify-center text-[#6E7480] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel Desplegable de Historial de Conversaciones (Firestore) */}
        {isHistoryOpen && (
          <div className="mx-6 mb-2 p-3.5 rounded-[20px] bg-[#F7F9FB] border border-[#EEF1F5] max-h-60 overflow-y-auto space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[0.72rem] font-bold text-[#6E7480] uppercase tracking-wider">
                Conversaciones recientes
              </span>
              <button
                type="button"
                onClick={handleStartNewSession}
                className="text-[0.72rem] font-bold text-[#141519] hover:underline cursor-pointer"
              >
                + Sesión limpia
              </button>
            </div>

            {conversations.length === 0 ? (
              <p className="text-[0.76rem] font-medium text-[#8E95A2] py-3 text-center">
                Tus conversaciones con Aether se guardarán aquí automáticamente.
              </p>
            ) : (
              conversations.map((conv) => {
                const isCurrent = conv.id === activeConversationId;
                const userTurns = conv.messages.filter(
                  (m) => m.role === 'user'
                ).length;

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-2.5 rounded-[14px] border flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-[#FFFFFF] border-[#141519] shadow-2xs'
                        : 'bg-[#FFFFFF]/70 hover:bg-[#FFFFFF] border-[#EEF1F5]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${
                          isCurrent
                            ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text'
                            : 'bg-[#F7F9FB] text-[#6E7480]'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.8rem] font-bold text-[#141519] truncate">
                          {conv.title}
                        </p>
                        <p className="text-[0.68rem] font-medium text-[#8E95A2] tabular-nums">
                          {formatRelativeSessionDate(conv.updatedAt)} ·{' '}
                          {Math.max(1, userTurns)}{' '}
                          {userTurns === 1 ? 'mensaje' : 'mensajes'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                        if (conv.id === activeConversationId) {
                          handleStartNewSession();
                        }
                      }}
                      title="Eliminar conversación"
                      aria-label="Eliminar conversación"
                      className="w-7 h-7 rounded-full hover:bg-[#F28B82]/25 text-[#8E95A2] hover:text-[#141519] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Historial de Chat */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
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

        {/* Píldora Flotante Inferior Unificada (Estilo Gemini Voice Equalizer) */}
        <div className="px-5 pb-5 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isVoiceMode) {
                finishAndSendVoice();
              } else {
                handleSend();
              }
            }}
            className={`flex items-center gap-2.5 p-2 rounded-full border transition-all duration-300 shadow-[0_8px_28px_-6px_rgba(20,21,25,0.08)] ${
              showEqualizerInCenter
                ? 'bg-[#FFFFFF] border-[#BBC6F8]'
                : 'bg-[#F7F9FB] border-[#EEF1F5] focus-within:bg-[#FFFFFF] focus-within:border-[#BBC6F8]'
            }`}
          >
            {/* Botón Izquierdo: Micrófono (en reposo) o Cancelar Voz (en modo voz) */}
            {showEqualizerInCenter ? (
              <button
                type="button"
                onClick={cancelVoiceMode}
                title="Salir del modo de voz"
                aria-label="Salir del modo de voz"
                className="w-10 h-10 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startVoiceMode}
                title="Hablar con Aether (Modo de voz)"
                aria-label="Activar modo de voz"
                className="w-10 h-10 rounded-full bg-[#FFFFFF] hover:bg-[#EBF0F5] text-[#141519] border border-[#EEF1F5] flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            {/* Espacio Central: Input de Texto Habitual O Barra Horizontal de Líneas de Audio */}
            {showEqualizerInCenter ? (
              <div
                onClick={() => pulseSpeechActivity(900)}
                title="Habla ahora para animar el ecualizador"
                className="flex-1 flex items-center justify-between gap-[3px] h-10 px-2 select-none cursor-pointer"
              >
                {EQUALIZER_BARS.map((bar) => {
                  // Si hay niveles reales del micrófono (Web Audio API), úsalos;
                  // si no hay audio activo, la línea queda plana (3px) y estática.
                  const liveBarHeight = liveLevels?.[bar.idx];
                  const heightPx = isAudioWaveDancing
                    ? liveBarHeight ?? bar.activeHeight
                    : 3;

                  const shouldUseCssWave =
                    isAudioWaveDancing && !liveLevels;

                  return (
                    <span
                      key={bar.idx}
                      className={`w-[2.5px] rounded-full transition-all duration-150 ${
                        shouldUseCssWave
                          ? 'aether-vbar aether-vbar-speaking'
                          : ''
                      }`}
                      style={{
                        height: `${heightPx}px`,
                        backgroundColor: isAudioWaveDancing
                          ? bar.isAccent
                            ? '#141519'
                            : '#9BA9F0'
                          : '#C5CBD6',
                        animationDelay: shouldUseCssWave ? bar.delay : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Habla o escribe a Aether..."
                className="flex-1 bg-transparent px-1 py-2 text-[0.9rem] font-medium text-[#141519] placeholder-[#A0A6B2] focus:outline-none"
              />
            )}

            {/* Botón Derecho: Enviar Texto o Finalizar/Enviar Audio */}
            {isVoiceMode ? (
              <button
                type="button"
                onClick={finishAndSendVoice}
                title="Finalizar y enviar voz"
                aria-label="Finalizar y enviar voz"
                className="w-10 h-10 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-[#FFFFFF] flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <Check className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                aria-label="Enviar mensaje"
                className="w-10 h-10 rounded-full bg-[#141519] hover:bg-[#2A2C34] disabled:opacity-25 text-[#FFFFFF] flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
