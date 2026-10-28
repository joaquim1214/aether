import {
  CalendarDay,
  DailyActivity,
  GoogleTaskItem,
  ScheduleBlock,
  SkillItem,
  VaultItem,
  WishlistItem,
} from '../types/lifeOs';

/**
 * MODO PRODUCCIÓN REAL — CERO MOCK DATA
 * Todos los arreglos iniciales comienzan limpios ([]) y se alimentan
 * en tiempo real desde Firebase Firestore y Google Calendar / Tasks APIs.
 */
export const INITIAL_SKILLS: SkillItem[] = [];
export const INITIAL_VAULT: VaultItem[] = [];
export const INITIAL_WISHLIST: WishlistItem[] = [];
export const INITIAL_SCHEDULE: ScheduleBlock[] = [];

const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAY_FULL = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const MONTH_NAMES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/**
 * Genera la estructura limpia de los últimos 7 días (con 0.0h por defecto)
 * para ser hidratada con los documentos reales de la colección `daily_hours`.
 */
export function buildEmptyWeekActivity(referenceDate = new Date()): DailyActivity[] {
  const days: DailyActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(referenceDate.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const isToday = i === 0;
    days.push({
      id: dateKey,
      dayShort: WEEKDAY_SHORT[d.getDay()],
      dayLabel: `${WEEKDAY_FULL[d.getDay()]} ${d.getDate()} ${
        MONTH_NAMES_SHORT[d.getMonth()]
      }${isToday ? ' (Hoy)' : ''}`,
      dateNum: d.getDate(),
      dateKey,
      hours: 0,
      focusTopic: 'Sin sesiones registradas',
      isToday,
    });
  }
  return days;
}

/**
 * Construye la matriz circular real de un mes calendario (Do - Sá),
 * marcando en Mint (#A8E6E3) los días con eventos de Google Calendar
 * y en Lavender (#BBC6F8) los días con tareas de Google Tasks.
 */
export function buildMonthCalendarMatrix(
  year: number,
  monthIndex: number,
  events: ScheduleBlock[] = [],
  tasks: GoogleTaskItem[] = []
): CalendarDay[] {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startWeekday = firstDayOfMonth.getDay(); // 0 (Dom) - 6 (Sáb)

  const matrix: CalendarDay[] = [];

  for (let i = 0; i < startWeekday; i++) {
    matrix.push({
      id: `empty-prev-${i}`,
      dayNumber: null,
      state: 'empty',
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = events.filter((e) => e.dayOfMonth === day);
    const dayTasks = tasks.filter((t) => {
      if (!t.due) return false;
      const dueDate = new Date(t.due);
      return (
        !isNaN(dueDate.getTime()) &&
        dueDate.getUTCDate() === day &&
        dueDate.getUTCMonth() === monthIndex
      );
    });

    let state: CalendarDay['state'] = 'normal';
    let label: string | undefined;

    if (dayEvents.length > 0) {
      const firstEv = dayEvents[0];
      state = firstEv.accent || 'mint';
      label = firstEv.title;
    } else if (dayTasks.length > 0) {
      state = 'lavender';
      label = dayTasks[0].title;
    }

    matrix.push({
      id: `day-${year}-${monthIndex + 1}-${day}`,
      dayNumber: day,
      state,
      label,
      eventsCount: dayEvents.length + dayTasks.length,
    });
  }

  while (matrix.length % 7 !== 0) {
    matrix.push({
      id: `empty-next-${matrix.length}`,
      dayNumber: null,
      state: 'empty',
    });
  }

  return matrix;
}

export const INITIAL_ACTIVITY: DailyActivity[] = buildEmptyWeekActivity();
export const INITIAL_CALENDAR_MATRIX: CalendarDay[] = buildMonthCalendarMatrix(
  new Date().getFullYear(),
  new Date().getMonth()
);
