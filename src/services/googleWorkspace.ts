import { GoogleTaskItem, ScheduleBlock } from '../types/lifeOs';
import { getAccessToken } from './firebase';

const CALENDAR_EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TASKS_ENDPOINT =
  'https://www.googleapis.com/tasks/v1/lists/@default/tasks';

function formatTimeRangeFromIso(startIso?: string, endIso?: string): string {
  if (!startIso) return 'Todo el día';
  const startDate = new Date(startIso);
  if (isNaN(startDate.getTime())) return 'Todo el día';

  // If it's a date-only string like "2026-10-27"
  if (!startIso.includes('T')) {
    return 'Todo el día';
  }

  const fmt = (d: Date) => {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${m} ${suffix}`;
  };

  if (endIso && endIso.includes('T')) {
    const endDate = new Date(endIso);
    if (!isNaN(endDate.getTime())) {
      return `${fmt(startDate)} - ${fmt(endDate)}`;
    }
  }
  return fmt(startDate);
}

/**
 * 1. GOOGLE CALENDAR API: List events from primary calendar
 */
export async function fetchGoogleCalendarEvents(
  year = new Date().getFullYear(),
  monthIndex = new Date().getMonth()
): Promise<ScheduleBlock[]> {
  const token = getAccessToken();
  if (!token) return [];

  const timeMin = new Date(year, monthIndex, 1, 0, 0, 0).toISOString();
  const timeMax = new Date(year, monthIndex + 1, 0, 23, 59, 59).toISOString();

  const url = `${CALENDAR_EVENTS_ENDPOINT}?timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(
    timeMax
  )}&singleEvents=true&orderBy=startTime&maxResults=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const items: any[] = Array.isArray(data.items) ? data.items : [];

  return items.map((ev, idx): ScheduleBlock => {
    const startRaw: string = ev.start?.dateTime || ev.start?.date || '';
    const endRaw: string = ev.end?.dateTime || ev.end?.date || '';
    const startDate = startRaw ? new Date(startRaw) : new Date();
    const dayOfMonth = !isNaN(startDate.getTime())
      ? startDate.getDate()
      : new Date().getDate();

    const now = Date.now();
    const endMs = endRaw ? new Date(endRaw).getTime() : startDate.getTime();
    const completion = endMs < now ? 100 : 0;

    return {
      id: `gcal-${ev.id}`,
      googleEventId: ev.id,
      title: ev.summary || '(Evento sin título)',
      time: formatTimeRangeFromIso(startRaw, endRaw),
      dayOfMonth,
      completion,
      category: 'Sync',
      accent: idx % 2 === 0 ? 'mint' : 'lavender',
      syncedSource: 'Google Calendar',
      htmlLink: ev.htmlLink,
      startIso: startRaw,
      endIso: endRaw,
    };
  });
}

/**
 * 2. GOOGLE CALENDAR API: Create a new real event in primary calendar
 */
export async function createGoogleCalendarEvent(params: {
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
}): Promise<ScheduleBlock> {
  const token = getAccessToken();
  if (!token) {
    throw new Error(
      'No hay sesión activa con Google Calendar. Haz clic en "Iniciar sesión" arriba a la derecha.'
    );
  }

  const body = {
    summary: params.title,
    description: params.description || 'Agendado desde Aether',
    start: {
      dateTime: params.startIso,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    end: {
      dateTime: params.endIso,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  };

  const res = await fetch(CALENDAR_EVENTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al crear evento en Google Calendar: ${errText}`);
  }

  const ev = await res.json();
  const startRaw: string = ev.start?.dateTime || params.startIso;
  const endRaw: string = ev.end?.dateTime || params.endIso;
  const startDate = new Date(startRaw);

  return {
    id: `gcal-${ev.id}`,
    googleEventId: ev.id,
    title: ev.summary || params.title,
    time: formatTimeRangeFromIso(startRaw, endRaw),
    dayOfMonth: !isNaN(startDate.getTime())
      ? startDate.getDate()
      : new Date().getDate(),
    completion: 0,
    category: 'Sync',
    accent: 'mint',
    syncedSource: 'Google Calendar',
    htmlLink: ev.htmlLink,
    startIso: startRaw,
    endIso: endRaw,
  };
}

/**
 * 3. GOOGLE CALENDAR API: Delete an event from primary calendar
 */
export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No hay token de Google Calendar activo.');
  }

  const res = await fetch(
    `${CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`No se pudo eliminar el evento: ${errText}`);
  }
}

/**
 * 4. GOOGLE TASKS API: List tasks from @default tasklist
 */
export async function fetchGoogleTasks(): Promise<GoogleTaskItem[]> {
  const token = getAccessToken();
  if (!token) return [];

  const res = await fetch(
    `${TASKS_ENDPOINT}?showCompleted=true&maxResults=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Tasks API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const items: any[] = Array.isArray(data.items) ? data.items : [];

  return items
    .filter((t) => Boolean(t.title && t.title.trim()))
    .map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      due: t.due,
      status: t.status === 'completed' ? 'completed' : 'needsAction',
      updated: t.updated,
    }));
}

/**
 * 5. GOOGLE TASKS API: Create a new task in @default tasklist
 */
export async function createGoogleTaskItem(params: {
  title: string;
  notes?: string;
  dueIso?: string;
}): Promise<GoogleTaskItem> {
  const token = getAccessToken();
  if (!token) {
    throw new Error(
      'No hay sesión activa con Google Tasks. Haz clic en "Iniciar sesión" arriba a la derecha.'
    );
  }

  const payload: Record<string, any> = {
    title: params.title,
  };
  if (params.notes) payload.notes = params.notes;
  if (params.dueIso) {
    const d = new Date(params.dueIso);
    if (!isNaN(d.getTime())) {
      payload.due = d.toISOString();
    }
  }

  const res = await fetch(TASKS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al crear tarea en Google Tasks: ${errText}`);
  }

  const created = await res.json();
  return {
    id: created.id,
    title: created.title || params.title,
    notes: created.notes,
    due: created.due,
    status: created.status === 'completed' ? 'completed' : 'needsAction',
    updated: created.updated,
  };
}

/**
 * 6. GOOGLE TASKS API: Toggle task completion status
 */
export async function updateGoogleTaskStatus(
  taskId: string,
  completed: boolean
): Promise<GoogleTaskItem> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No hay sesión activa con Google Tasks.');
  }

  const res = await fetch(`${TASKS_ENDPOINT}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: completed ? 'completed' : 'needsAction',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al actualizar tarea en Google Tasks: ${errText}`);
  }

  const updated = await res.json();
  return {
    id: updated.id,
    title: updated.title,
    notes: updated.notes,
    due: updated.due,
    status: updated.status === 'completed' ? 'completed' : 'needsAction',
    updated: updated.updated,
  };
}

/**
 * 7. GOOGLE TASKS API: Delete a task from @default tasklist
 */
export async function deleteGoogleTaskItem(taskId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No hay sesión activa con Google Tasks.');
  }

  const res = await fetch(`${TASKS_ENDPOINT}/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`No se pudo eliminar la tarea: ${errText}`);
  }
}

/**
 * Helper to build startIso and endIso from a day number and a time range string like "17:00 - 18:30" or "5pm a 7pm"
 */
export function buildEventIsoRange(
  dayOfMonth: number,
  timeRangeStr: string,
  year = new Date().getFullYear(),
  monthIndex = new Date().getMonth()
): { startIso: string; endIso: string } {
  let startHour = 17;
  let startMin = 0;
  let endHour = 18;
  let endMin = 30;

  const matches = Array.from(
    timeRangeStr.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)
  );
  if (matches.length >= 1) {
    let h1 = parseInt(matches[0][1], 10);
    const m1 = parseInt(matches[0][2] || '0', 10);
    const ampm1 = matches[0][3]?.toLowerCase();
    if (ampm1 === 'pm' && h1 < 12) h1 += 12;
    if (ampm1 === 'am' && h1 === 12) h1 = 0;
    startHour = Math.min(23, Math.max(0, h1));
    startMin = Math.min(59, Math.max(0, m1));
    endHour = Math.min(23, startHour + 1);
    endMin = startMin;
  }

  if (matches.length >= 2) {
    let h2 = parseInt(matches[1][1], 10);
    const m2 = parseInt(matches[1][2] || '0', 10);
    const ampm2 = matches[1][3]?.toLowerCase();
    if (ampm2 === 'pm' && h2 < 12) h2 += 12;
    if (ampm2 === 'am' && h2 === 12) h2 = 0;
    if (!ampm2 && h2 < startHour && h2 <= 12) h2 += 12;
    endHour = Math.min(23, Math.max(startHour, h2));
    endMin = Math.min(59, Math.max(0, m2));
  }

  const startDate = new Date(year, monthIndex, dayOfMonth, startHour, startMin, 0);
  const endDate = new Date(year, monthIndex, dayOfMonth, endHour, endMin, 0);
  if (endDate <= startDate) {
    endDate.setHours(startDate.getHours() + 1);
  }

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}
