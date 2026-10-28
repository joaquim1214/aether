import React, { useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AssistantActionRecord,
  AssistantMessage,
  SkillItem,
  TabId,
} from '../types/lifeOs';

interface GeminiActionHubProps {
  isOpen: boolean;
  onClose: () => void;
  skills: SkillItem[];
  isCloudConnected: boolean;
  isGoogleWorkspaceConnected: boolean;
  onExecuteAction: (action: {
    name: string;
    args: Record<string, any>;
  }) => Promise<AssistantActionRecord | null>;
  onNavigateTab: (tab: TabId) => void;
}

const QUICK_PROMPTS = [
  'Busca y guarda la canción "Midnight City" de M83 en Spotify',
  'Guarda mi playlist "Deep Work" de Spotify',
  'Hoy entrené 1 hora de Básquet, metí 8/10 triples seguidos',
  'Terminé de ver "Dune: Part Two", le doy un 9.8/10',
  'Agéndame partido de Fútbol mañana a las 19:00 en Google Calendar',
];

export const GeminiActionHub: React.FC<GeminiActionHubProps> = ({
  isOpen,
  onClose,
  skills,
  isCloudConnected,
  isGoogleWorkspaceConnected,
  onExecuteAction,
  onNavigateTab,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        '¡Hola Joaquim! Soy tu Aether Assistant con Function Calling en producción. Todo lo que me pidas se guarda directamente en Firebase Firestore o se agenda en tiempo real en tu Google Calendar y Google Tasks.',
      timestamp: new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    },
  ]);

  if (!isOpen) return null;

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? input).trim();
    if (!textToSend || isLoading) return;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          context: { skills },
        }),
      });

      const data = await response.json();
      const rawActions: Array<{ name: string; args: Record<string, any> }> =
        data.actions || [];

      const executedRecords: AssistantActionRecord[] = [];
      for (const act of rawActions) {
        const record = await onExecuteAction(act);
        if (record) executedRecords.push(record);
      }

      const assistantMsg: AssistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.reply ||
          'Listo, he sincronizado tus cambios con Firebase y Google Workspace.',
        timestamp: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        actions: executedRecords,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'No pude procesar la solicitud en este momento. Intenta de nuevo en unos segundos.',
          timestamp: new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoiceDictation = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setInput('Hoy entrené 1 hora de Básquet y metí 8/10 triples');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-3 sm:p-6 bg-[#141519]/35 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-[475px] bg-[#FFFFFF] rounded-[28px] border border-[#EEF1F5] shadow-floating-dock overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header with Sparkles icon in circular #A8E6E3 */}
        <div className="bg-soft-mesh-header px-6 py-5 border-b border-[#EEF1F5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#A8E6E3] border-2 border-[#141519] text-[#141519] keep-dark-text flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[1.05rem] font-bold text-[#141519]">
                  Aether Assistant
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.66rem] font-semibold">
                  {isCloudConnected ? 'Firestore + Google API' : 'Local Sync'}
                </span>
              </div>
              <p className="text-[0.74rem] font-medium text-[#6E7480]">
                {isGoogleWorkspaceConnected
                  ? 'Sincronizado con Firebase, Calendar y Tasks'
                  : 'Conectado a Bóveda, Habilidades, Wishlist y Agenda'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="w-9 h-9 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F3F6F8]/60">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                {msg.role === 'assistant' && (
                  <Bot className="w-3.5 h-3.5 text-[#141519]" />
                )}
                <span className="text-[0.68rem] font-semibold text-[#8E95A2] tabular-nums">
                  {msg.role === 'user' ? 'Tú' : 'Aether Assistant'} ·{' '}
                  {msg.timestamp}
                </span>
              </div>

              <div
                className={`max-w-[92%] rounded-[22px] px-4 py-3 text-[0.85rem] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#141519] text-white rounded-br-[6px]'
                    : 'bg-white text-[#141519] border border-[#EEF1F5] shadow-bento rounded-bl-[6px]'
                }`}
              >
                <p>{msg.content}</p>

                {/* Soft Bento Confirmation Cards for Executed Actions */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#EEF1F5] space-y-2.5">
                    {msg.actions.map((act, idx) => {
                      const cardGradient =
                        act.accent === 'lavender'
                          ? 'bg-lavender-gradient'
                          : 'bg-mint-gradient';

                      return (
                        <div
                          key={idx}
                          className={`${cardGradient} inner-card-stroke rounded-[20px] p-3.5 flex flex-col gap-2`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-[12px] bg-white text-[#141519] keep-dark-text flex items-center justify-center shrink-0 shadow-2xs">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#141519]/75 keep-dark-text">
                                    {act.name}
                                  </span>
                                  {act.sourceBadge && (
                                    <span className="px-2 py-0.5 rounded-full bg-white/80 text-[#141519] keep-dark-text text-[0.64rem] font-bold flex items-center gap-1">
                                      <Database className="w-2.5 h-2.5" />
                                      {act.sourceBadge}
                                    </span>
                                  )}
                                </div>
                                <span className="block text-[0.82rem] font-bold text-[#141519] keep-dark-text leading-snug mt-0.5">
                                  {act.summary}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onNavigateTab(act.targetModule);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.68rem] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <span>Abrir</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </div>

                          {act.details && (
                            <p className="text-[0.72rem] font-medium text-[#141519]/80 keep-dark-text bg-white/45 rounded-[12px] px-2.5 py-1.5 border border-white/50">
                              {act.details}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-[20px] bg-white border border-[#EEF1F5] w-fit">
              <Loader2 className="w-4 h-4 animate-spin text-[#141519]" />
              <span className="text-[0.8rem] font-medium text-[#6E7480]">
                Ejecutando herramientas en Firebase / Google APIs...
              </span>
            </div>
          )}
        </div>

        {/* Suggested natural language prompts */}
        <div className="px-5 py-3 bg-white border-t border-[#EEF1F5]">
          <span className="block text-[0.7rem] font-semibold text-[#8E95A2] mb-2">
            Prueba una acción en tiempo real:
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                type="button"
                onClick={() => handleSend(qp)}
                className="px-3 py-1.5 rounded-full bg-[#F7F9FB] hover:bg-[#A8E6E3]/50 border border-[#EEF1F5] text-[0.72rem] font-medium text-[#141519] whitespace-nowrap transition-colors cursor-pointer shrink-0"
              >
                {qp}
              </button>
            ))}
          </div>
        </div>

        {/* Input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 bg-white border-t border-[#EEF1F5] flex items-center gap-2"
        >
          <button
            type="button"
            onClick={toggleVoiceDictation}
            title="Dictar comando por voz"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
              isListening
                ? 'bg-[#F28B82] text-[#141519]'
                : 'bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#141519]'
            }`}
          >
            {isListening ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej: Hoy entrené 1h de Básquet, agéndame..."
            className="flex-1 h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519]"
          />

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="h-10 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] disabled:opacity-40 text-white text-[0.8rem] font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
          >
            <span>Enviar</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
