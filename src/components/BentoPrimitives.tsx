import React from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  Cpu,
  Dumbbell,
  Languages,
  Layers,
  MoreHorizontal,
  Music,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  CalendarDay,
  DailyActivity,
  ScheduleBlock,
  SkillItem,
} from '../types/lifeOs';

interface BentoHeaderProps {
  icon: React.ReactNode;
  title: string;
  countBadge?: string | number;
  rightSlot?: React.ReactNode;
}

export const BentoHeader: React.FC<BentoHeaderProps> = ({
  icon,
  title,
  countBadge,
  rightSlot,
}) => {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519] shrink-0">
          {icon}
        </div>
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em] text-[#141519] truncate">
          {title}
        </h2>
        {countBadge !== undefined && (
          <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.7rem] font-semibold tracking-[0.01em] tabular-nums shrink-0">
            {countBadge}
          </span>
        )}
      </div>
      {rightSlot && (
        <div className="flex items-center gap-1.5 shrink-0">{rightSlot}</div>
      )}
    </div>
  );
};

interface SoftBentoEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  onAskAssistant?: () => void;
  compact?: boolean;
}

export const SoftBentoEmptyState: React.FC<SoftBentoEmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  onAskAssistant,
  compact = false,
}) => {
  return (
    <div
      className={`w-full rounded-[20px] bg-striped-pattern border border-[#EEF1F5] flex flex-col items-center justify-center text-center ${
        compact ? 'p-5 py-6' : 'p-7 py-9'
      }`}
    >
      <div className="w-12 h-12 rounded-[16px] bg-[#FFFFFF] border border-[#EEF1F5] shadow-2xs flex items-center justify-center text-[#141519] mb-3">
        {icon}
      </div>
      <h3 className="text-[0.95rem] font-bold text-[#141519] mb-1">{title}</h3>
      <p className="text-[0.78rem] font-medium text-[#6E7480] max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAction}
          className="h-9 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.76rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{actionLabel}</span>
        </button>
        {onAskAssistant && (
          <button
            type="button"
            onClick={onAskAssistant}
            className="h-9 px-3.5 rounded-full bg-[#FFFFFF] hover:bg-[#F7F9FB] border border-[#EEF1F5] text-[#141519] text-[0.75rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#6CD4CE]" />
            <span>Pedir al Asistente IA</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const SkillIcon: React.FC<{
  name: SkillItem['iconName'];
  className?: string;
}> = ({ name, className = 'w-5 h-5' }) => {
  switch (name) {
    case 'layers':
      return <Layers className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'languages':
      return <Languages className={className} />;
    case 'music':
      return <Music className={className} />;
    case 'dumbbell':
      return <Dumbbell className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'target':
      return <Target className={className} />;
    default:
      return <Layers className={className} />;
  }
};

interface PastelSkillCardProps {
  skill: SkillItem;
  onAddHour: (skillId: string, hours?: number) => void;
  onSelect?: (skill: SkillItem) => void;
  onDelete?: (skill: SkillItem) => void;
  compact?: boolean;
}

export const PastelSkillCard: React.FC<PastelSkillCardProps> = ({
  skill,
  onAddHour,
  onSelect,
  onDelete,
  compact = false,
}) => {
  const gradientClass =
    skill.accent === 'mint' ? 'bg-mint-gradient' : 'bg-lavender-gradient';
  const isSports =
    skill.branch === 'sports' || skill.unitLabel === 'Entrenamientos';

  return (
    <div
      onClick={() => onSelect && onSelect(skill)}
      className={`${gradientClass} inner-card-stroke rounded-[20px] p-5 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 ${
        onSelect ? 'cursor-pointer' : ''
      }`}
    >
      {/* Top row: 44x44px white icon container + action controls */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="w-[44px] h-[44px] rounded-[14px] bg-white text-[#141519] keep-dark-text flex items-center justify-center shadow-xs shrink-0">
          <SkillIcon name={skill.iconName} className="w-5 h-5" />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-semibold tracking-[0.01em] tabular-nums whitespace-nowrap">
            Lv. {skill.level}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddHour(skill.id, 1);
            }}
            title={
              isSports
                ? 'Registrar +1 Entrenamiento / Partido'
                : 'Sumar +1 hora de práctica'
            }
            className="h-8 px-2.5 rounded-full bg-white/80 hover:bg-white text-[#141519] keep-dark-text text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              {isSports ? '1 Entrenamiento' : '1h'}
            </span>
          </button>
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(skill);
              }}
              title="Eliminar habilidad"
              aria-label="Eliminar habilidad"
              className="w-8 h-8 rounded-full bg-white/55 hover:bg-[#F28B82] text-[#141519] keep-dark-text flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelect) onSelect(skill);
              }}
              aria-label="Detalles de habilidad"
              className="w-8 h-8 rounded-full bg-white/50 hover:bg-white/80 text-[#141519] keep-dark-text flex items-center justify-center transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Center: Title in #141519 + translucent white tag pills */}
      <div className="mb-4">
        <div className="text-[0.75rem] font-medium text-[#141519]/75 keep-dark-text mb-0.5">
          {skill.category} ·{' '}
          <span className="tabular-nums font-bold text-[#141519] keep-dark-text">
            {isSports
              ? `${skill.hoursInvested} entrenamientos`
              : `${skill.hoursInvested}h acumuladas`}
          </span>
        </div>
        <h3 className="text-[1.125rem] font-semibold text-[#141519] keep-dark-text leading-snug mb-2">
          {skill.name}
        </h3>

        {skill.sportStats && (
          <div className="mb-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/55 border border-white/60 text-[0.7rem] font-bold text-[#141519] keep-dark-text tabular-nums">
            <span>⚡ {skill.sportStats}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {skill.tags.slice(0, compact ? 2 : 3).map((tag) => (
            <span
              key={tag}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.35)' }}
              className="px-2.5 py-1 rounded-full text-[0.7rem] font-semibold text-[#141519] keep-dark-text border border-white/50 backdrop-blur-[2px] whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom: Pure white progress bar (#FFFFFF) + percentage */}
      <div>
        <div className="flex items-center justify-between text-[0.75rem] font-semibold text-[#141519] keep-dark-text mb-1.5">
          <span>{isSports ? 'Progreso XP & Ritmo' : 'Progreso de Nivel'}</span>
          <span className="tabular-nums">{skill.progress}%</span>
        </div>
        <div
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.35)' }}
          className="w-full h-2.5 rounded-full overflow-hidden p-0.5 border border-white/40"
        >
          <div
            className="h-full bg-[#FFFFFF] keep-white rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(6, skill.progress))}%` }}
          />
        </div>
      </div>
    </div>
  );
};

interface PillBarChartProps {
  data: DailyActivity[];
  selectedDate: number;
  onSelectDate: (dateNum: number) => void;
  goalHours?: number;
}

export const PillBarChart: React.FC<PillBarChartProps> = ({
  data,
  selectedDate,
  onSelectDate,
  goalHours = 4.0,
}) => {
  const maxHours = Math.max(6.5, ...data.map((d) => d.hours));
  const goalBottomPercent = Math.min(
    88,
    Math.round((goalHours / maxHours) * 100)
  );

  return (
    <div className="relative pt-4 pb-1">
      {/* Horizontal dashed goal line */}
      <div
        className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
        style={{ bottom: `calc(${goalBottomPercent}% + 24px)` }}
      >
        <div className="w-full border-t border-dashed border-[#8E95A2]/70" />
        <span className="ml-2 px-2 py-0.5 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.68rem] font-semibold text-[#6E7480] tabular-nums whitespace-nowrap">
          Meta {goalHours.toFixed(1)}h
        </span>
      </div>

      {/* Vertical capsule columns */}
      <div className="grid grid-cols-7 gap-2.5 sm:gap-3 items-end h-[188px] pt-6">
        {data.map((day) => {
          const isSelected = day.dateNum === selectedDate;
          const heightPercent = Math.max(
            24,
            Math.min(100, Math.round((day.hours / maxHours) * 100))
          );

          return (
            <button
              key={day.dateNum}
              type="button"
              onClick={() => onSelectDate(day.dateNum)}
              className="group flex flex-col items-center justify-end h-full focus:outline-none cursor-pointer"
            >
              {/* Hours floating label */}
              <span
                className={`text-[0.7rem] font-semibold tabular-nums mb-1.5 transition-colors ${
                  isSelected
                    ? 'text-[#141519] font-bold'
                    : 'text-[#8E95A2] group-hover:text-[#141519]'
                }`}
              >
                {day.hours.toFixed(1)}h
              </span>

              {/* Pill Bar Capsule */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full max-w-[44px] rounded-full relative transition-all duration-200 flex flex-col items-center justify-start pt-2.5 ${
                  isSelected
                    ? 'bg-[#141519] text-white shadow-sm'
                    : 'bg-striped-pattern border-t-[4px] border-t-[#6CD4CE] border-x border-b border-[#EEF1F5] group-hover:border-[#6CD4CE]'
                }`}
              >
                {/* Internal top white triangle on active pill */}
                {isSelected && (
                  <div
                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-white"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Day label */}
              <span
                className={`mt-2 text-[0.75rem] font-medium transition-colors ${
                  isSelected ? 'text-[#141519] font-bold' : 'text-[#6E7480]'
                }`}
              >
                {day.dayShort}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface CalendarMatrixProps {
  days: CalendarDay[];
  selectedDay: number;
  onSelectDay: (dayNumber: number) => void;
}

export const CalendarMatrix: React.FC<CalendarMatrixProps> = ({
  days,
  selectedDay,
  onSelectDay,
}) => {
  const weekDays = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2.5 text-center">
        {weekDays.map((wd) => (
          <span
            key={wd}
            className="text-[0.72rem] font-semibold text-[#8E95A2]"
          >
            {wd}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 justify-items-center">
        {days.map((d) => {
          if (d.dayNumber === null || d.state === 'empty') {
            return (
              <div
                key={d.id}
                className="w-9 h-9 rounded-full bg-striped-subtle border border-[#EEF1F5]/80"
                title="Día vacío"
              />
            );
          }

          const isSelected = d.dayNumber === selectedDay;
          let stateClasses = 'bg-[#F7F9FB] text-[#141519] hover:bg-[#EBF0F5]';
          if (d.state === 'mint') {
            stateClasses =
              'bg-[#A8E6E3] text-[#141519] keep-dark-text hover:brightness-95';
          } else if (d.state === 'lavender') {
            stateClasses =
              'bg-[#BBC6F8] text-[#141519] keep-dark-text hover:brightness-95';
          }

          if (isSelected) {
            stateClasses += ' ring-2 ring-[#141519] font-bold';
          }

          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelectDay(d.dayNumber!)}
              title={d.label || `Día ${d.dayNumber}`}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums transition-all cursor-pointer ${stateClasses}`}
            >
              {d.dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface TimelineScheduleProps {
  blocks: ScheduleBlock[];
  onToggleBlock: (blockId: string) => void;
  onDeleteBlock?: (block: ScheduleBlock) => void;
  onOpenCreate?: () => void;
  onAskAssistant?: () => void;
  userInitials?: string;
}

export const TimelineSchedule: React.FC<TimelineScheduleProps> = ({
  blocks,
  onToggleBlock,
  onDeleteBlock,
  onOpenCreate,
  onAskAssistant,
  userInitials = 'JQ',
}) => {
  if (blocks.length === 0) {
    return (
      <SoftBentoEmptyState
        icon={<CalendarIcon className="w-5 h-5" />}
        title="Tu Agenda del Día está libre"
        description="Conecta tu Google Calendar o agenda tu primer bloque de entrenamiento o estudio en cápsulas horizontales."
        actionLabel="+ Agendar Evento"
        onAction={() => onOpenCreate && onOpenCreate()}
        onAskAssistant={onAskAssistant}
        compact
      />
    );
  }

  const formatAmPm = (rawTime: string) => {
    if (
      rawTime.toLowerCase().includes('am') ||
      rawTime.toLowerCase().includes('pm') ||
      rawTime.toLowerCase().includes('todo')
    ) {
      return rawTime;
    }
    const parts = rawTime.split('-').map((p) => p.trim());
    const convert = (hhmm: string) => {
      const [hStr, mStr = '00'] = hhmm.split(':');
      const h = parseInt(hStr, 10);
      if (isNaN(h)) return hhmm;
      const suffix = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${String(h12).padStart(2, '0')}:${mStr} ${suffix}`;
    };
    return parts.map(convert).join(' - ');
  };

  return (
    <div className="relative py-2">
      {/* Vertical dashed current-time line crossing the timeline with black circular node */}
      <div
        className="absolute left-[46%] top-0 bottom-0 border-l-2 border-dashed border-[#8E95A2]/75 pointer-events-none z-20"
        aria-hidden="true"
      >
        <div
          className="w-3.5 h-3.5 rounded-full bg-[#141519] border-2 border-white shadow-sm -translate-x-[8px] -translate-y-1"
          title="Hora actual"
        />
      </div>

      <div className="space-y-3 relative z-10">
        {blocks.map((block, index) => {
          const pillGradient =
            block.accent === 'mint' ? 'bg-mint-gradient' : 'bg-lavender-gradient';
          const isDone = block.completion === 100;
          const offsetClasses =
            index % 3 === 1
              ? 'sm:ml-6'
              : index % 3 === 2
              ? 'sm:ml-3'
              : '';

          return (
            <div
              key={block.id}
              onClick={() => onToggleBlock(block.id)}
              className={`${pillGradient} inner-card-stroke rounded-full px-5 py-3 flex items-center justify-between gap-3 cursor-pointer transition-transform duration-150 hover:scale-[1.01] ${offsetClasses}`}
            >
              {/* Left: Task/Event Name and Time */}
              <div className="min-w-0 pr-2">
                <p
                  className={`text-[0.86rem] font-bold text-[#141519] keep-dark-text truncate ${
                    isDone ? 'line-through opacity-75' : ''
                  }`}
                >
                  {block.title}
                </p>
                <span className="block text-[0.72rem] font-semibold text-[#141519]/70 keep-dark-text tabular-nums mt-0.5">
                  {formatAmPm(block.time)}
                </span>
              </div>

              {/* Right: Progress percentage + Avatar + Optional Delete */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-full bg-white/85 text-[#141519] keep-dark-text text-[0.74rem] font-bold tabular-nums shadow-2xs">
                  {block.completion}%
                </span>
                <div className="w-8 h-8 rounded-full bg-[#141519] text-white text-[0.68rem] font-bold flex items-center justify-center border-2 border-white shrink-0 shadow-2xs">
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-[#A8E6E3]" />
                  ) : (
                    userInitials
                  )}
                </div>
                {onDeleteBlock && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBlock(block);
                    }}
                    title="Eliminar evento"
                    aria-label="Eliminar evento"
                    className="w-7 h-7 rounded-full bg-white/60 hover:bg-[#F28B82] text-[#141519] keep-dark-text flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
