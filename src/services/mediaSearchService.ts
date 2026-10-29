import { VaultFilterId } from '../types/lifeOs';
import {
  fetchImdbDetailsByQueryOrId,
  searchImdbDatabase,
} from './imdbApiService';
import {
  fetchUserSpotifyPlaylists,
  searchSpotifyCatalog,
} from './spotifyService';

export interface MediaSearchResult {
  id: string;
  title: string;
  creator: string;
  year: string;
  imdbId?: string;
  imdbRating?: string;
  imdbVotes?: string;
  actors?: string;
  plot?: string;
  releaseDate?: string;
  rawReleaseDate?: string;
  daysRemaining?: number;
  isFutureRelease?: boolean;
  isPastRelease?: boolean;
  releaseStatus?: 'upcoming' | 'released' | 'unknown';
  releaseFormat?: string;
  imageUrl?: string;
  audioPreviewUrl?: string;
  videoUrl?: string;
  tags: string[];
  mediaType: 'movie' | 'series' | 'anime' | 'song' | 'album' | 'video';
  sourceLabel: string;
  overview?: string;
}

/**
 * Upgrades iTunes 100x100bb artwork URL to 600x600bb high-resolution cover/poster.
 */
export function upgradeItunesArtwork(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/100x100bb/g, '600x600bb').replace(/100x100/g, '600x600');
}

const SPANISH_MONTHS: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  set: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
};

const SHORT_MONTH_LABELS = [
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

function formatLocalIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatSpanishShortDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = SHORT_MONTH_LABELS[d.getMonth()] || 'Ene';
  const yyyy = d.getFullYear();
  return `${dd} ${mon} ${yyyy}`;
}

function parseFlexibleDateToLocalMidnight(rawDate?: string): {
  date: Date | null;
  isYearOnly: boolean;
} {
  if (!rawDate) return { date: null, isYearOnly: false };
  const trimmed = rawDate.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'en espera' ||
    trimmed.toLowerCase() === 'por confirmar' ||
    trimmed.toLowerCase() === 'próximo estreno'
  ) {
    return { date: null, isYearOnly: false };
  }

  // 1. Exact YYYY-MM-DD (or ISO timestamp starting with YYYY-MM-DD)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const parsed = new Date(y, m, d);
    if (!isNaN(parsed.getTime())) {
      return { date: parsed, isYearOnly: false };
    }
  }

  // 2. Spanish date like "15 Nov 2026" or "15 de Noviembre de 2026"
  const esMatch = trimmed.match(
    /^(\d{1,2})\s+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú.]+)\s+(?:de\s+)?(\d{4})$/i
  );
  if (esMatch) {
    const day = parseInt(esMatch[1], 10);
    const monthKey = esMatch[2].replace(/\./g, '').toLowerCase();
    const year = parseInt(esMatch[3], 10);
    const monthIdx = SPANISH_MONTHS[monthKey];
    if (monthIdx !== undefined) {
      const parsed = new Date(year, monthIdx, day);
      if (!isNaN(parsed.getTime())) {
        return { date: parsed, isYearOnly: false };
      }
    }
  }

  // 3. Only 4-digit year (e.g. "2027" or "2014" or "2014–2019")
  const yearOnlyMatch = trimmed.match(/^(\d{4})(?:[–\-]\d{0,4})?$/);
  if (yearOnlyMatch) {
    const yearNum = parseInt(yearOnlyMatch[1], 10);
    const nowYear = new Date().getFullYear();
    if (yearNum > nowYear) {
      return { date: new Date(yearNum, 5, 15), isYearOnly: true };
    }
    if (yearNum < nowYear) {
      return { date: new Date(yearNum, 0, 1), isYearOnly: true };
    }
    return { date: null, isYearOnly: true };
  }

  // 4. Generic Date fallback (e.g., "07 Nov 2014" from OMDb)
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return {
      date: new Date(
        fallback.getFullYear(),
        fallback.getMonth(),
        fallback.getDate()
      ),
      isYearOnly: false,
    };
  }

  return { date: null, isYearOnly: false };
}

/**
 * Formats an ISO or Spanish date string and strictly compares against current system date.
 * - If release date is after today -> isFuture: true, exact daysRemaining (> 0)
 * - If release date is today or in the past -> isPast: true, daysRemaining: 0
 */
export function computeReleaseCountdown(rawDate?: string): {
  formattedDate: string;
  isoDate: string;
  daysRemaining: number;
  isFuture: boolean;
  isPast: boolean;
} {
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const defaultFuture = new Date(todayMidnight);
  defaultFuture.setDate(defaultFuture.getDate() + 30);

  if (!rawDate) {
    return {
      formattedDate: formatSpanishShortDate(defaultFuture),
      isoDate: formatLocalIsoDate(defaultFuture),
      daysRemaining: 30,
      isFuture: true,
      isPast: false,
    };
  }

  const { date: parsedDate } = parseFlexibleDateToLocalMidnight(rawDate);
  if (!parsedDate) {
    return {
      formattedDate: formatSpanishShortDate(defaultFuture),
      isoDate: formatLocalIsoDate(defaultFuture),
      daysRemaining: 30,
      isFuture: true,
      isPast: false,
    };
  }

  const diffMs = parsedDate.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formattedDate = formatSpanishShortDate(parsedDate);
  const isoDate = formatLocalIsoDate(parsedDate);

  if (diffDays > 0) {
    return {
      formattedDate,
      isoDate,
      daysRemaining: Math.min(3650, diffDays),
      isFuture: true,
      isPast: false,
    };
  }

  return {
    formattedDate,
    isoDate,
    daysRemaining: 0,
    isFuture: false,
    isPast: true,
  };
}

/**
 * Calcula con precisión el contador de días restantes para las tarjetas
 * de Hype Radar en el Dashboard y en la Bóveda a partir de `releaseDate`
 * o `daysRemaining` guardado.
 */
export function getAccurateHypeCountdown(
  releaseDate?: string,
  storedDaysRemaining?: number
): {
  daysRemaining: number;
  formattedDate: string;
  isoDate: string;
  isFuture: boolean;
  isPast: boolean;
} {
  if (releaseDate && releaseDate.trim() && releaseDate !== 'Por confirmar') {
    const { date: parsed } = parseFlexibleDateToLocalMidnight(releaseDate);
    if (parsed) {
      return computeReleaseCountdown(releaseDate);
    }
  }
  const safeDays =
    typeof storedDaysRemaining === 'number' && !isNaN(storedDaysRemaining)
      ? Math.max(0, Math.min(3650, Math.round(storedDaysRemaining)))
      : 15;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  target.setDate(target.getDate() + safeDays);
  return {
    daysRemaining: safeDays,
    formattedDate: releaseDate || formatSpanishShortDate(target),
    isoDate: formatLocalIsoDate(target),
    isFuture: safeDays > 0,
    isPast: safeDays <= 0,
  };
}

/**
 * Normalizes text for instant accent-insensitive and punctuation-tolerant matching.
 */
export function normalizeSearchQuery(raw?: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,:'"()\-–_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CLIENT_GENRE_ES: Record<string, string> = {
  action: 'Acción',
  adventure: 'Aventura',
  animation: 'Animación',
  anime: 'Anime',
  biography: 'Biografía',
  comedy: 'Comedia',
  crime: 'Crimen',
  documentary: 'Documental',
  drama: 'Drama',
  family: 'Familia',
  fantasy: 'Fantasía',
  history: 'Historia',
  horror: 'Terror',
  music: 'Música',
  musical: 'Musical',
  mystery: 'Misterio',
  romance: 'Romance',
  'sci-fi': 'Ciencia Ficción',
  'science-fiction': 'Ciencia Ficción',
  'science fiction': 'Ciencia Ficción',
  sport: 'Deporte',
  sports: 'Deporte',
  supernatural: 'Sobrenatural',
  thriller: 'Suspense / Thriller',
  war: 'Bélico',
  western: 'Western',
  'kids & family': 'Familia',
  'action & adventure': 'Acción & Aventura',
};

function translateGenreEs(raw?: string): string {
  if (!raw) return 'Cine';
  const clean = raw.trim();
  return CLIENT_GENRE_ES[clean.toLowerCase()] || clean;
}

const SEARCH_CACHE_STORAGE_KEY = 'aether_media_search_cache_v2';
const MEMORY_SEARCH_CACHE = new Map<
  string,
  { timestamp: number; results: MediaSearchResult[] }
>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

function loadSessionCache() {
  if (MEMORY_SEARCH_CACHE.size > 0 || typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<
      string,
      { timestamp: number; results: MediaSearchResult[] }
    >;
    const now = Date.now();
    Object.entries(parsed).forEach(([k, v]) => {
      if (v && Array.isArray(v.results) && now - v.timestamp < CACHE_TTL_MS) {
        MEMORY_SEARCH_CACHE.set(k, v);
      }
    });
  } catch {
    // ignore storage errors
  }
}

function saveToSearchCache(cacheKey: string, results: MediaSearchResult[]) {
  if (!results || results.length === 0) return;
  loadSessionCache();
  MEMORY_SEARCH_CACHE.set(cacheKey, {
    timestamp: Date.now(),
    results,
  });
  if (typeof window !== 'undefined') {
    try {
      const serializable: Record<
        string,
        { timestamp: number; results: MediaSearchResult[] }
      > = {};
      const entries = Array.from(MEMORY_SEARCH_CACHE.entries()).slice(-45);
      entries.forEach(([k, v]) => {
        serializable[k] = v;
      });
      sessionStorage.setItem(
        SEARCH_CACHE_STORAGE_KEY,
        JSON.stringify(serializable)
      );
    } catch {
      // ignore storage quota
    }
  }
}

const SPANISH_INSTANT_CATALOG: Array<
  MediaSearchResult & { aliases: string[] }
> = [
  {
    id: 'imdb-tt0119643',
    imdbId: 'tt0119643',
    title: '¿Conoces a Joe Black?',
    aliases: ['meet joe black', 'joe black', 'conoces a joe black', 'brad pitt'],
    creator: 'Martin Brest',
    year: '1998',
    imdbRating: '7.2',
    imdbVotes: '268K votos',
    actors: 'Brad Pitt, Anthony Hopkins, Claire Forlani',
    plot: 'El magnate de los medios William Parrish ve su vida alterada por la llegada de un enigmático joven llamado Joe Black (Brad Pitt), quien en realidad es la personificación de la Muerte en una misión terrenal y se enamora de la hija de Parrish.',
    overview:
      'El magnate de los medios William Parrish ve su vida alterada por la llegada de un enigmático joven llamado Joe Black (Brad Pitt), quien en realidad es la personificación de la Muerte en una misión terrenal.',
    releaseDate: '13 Nov 1998',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Película · IMDb 7.2 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BNTc0MzRmY2YtY2I4Yi00M2E1LThkLC1mN2Y0._V1_UX600_.jpg',
    tags: ['Drama', 'Fantasía', 'Romance'],
    mediaType: 'movie',
    sourceLabel: 'IMDb · Español',
  },
  {
    id: 'imdb-tt0816692',
    imdbId: 'tt0816692',
    title: 'Interestelar (Interstellar)',
    aliases: ['interstellar', 'interestelar', 'nolan'],
    creator: 'Christopher Nolan',
    year: '2014',
    imdbRating: '8.7',
    imdbVotes: '2.1M votos',
    actors: 'Matthew McConaughey, Anne Hathaway, Jessica Chastain',
    plot: 'Un grupo de exploradores e investigadores espaciales viaja a través de un agujero de gusano cerca de Saturno en un intento desesperado por asegurar la supervivencia de la humanidad en un nuevo hogar estelar.',
    overview:
      'Un grupo de exploradores e investigadores espaciales viaja a través de un agujero de gusano cerca de Saturno para salvar a la humanidad.',
    releaseDate: '07 Nov 2014',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Película · IMDb 8.7 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_UX600_.jpg',
    tags: ['Ciencia Ficción', 'Drama', 'Aventura'],
    mediaType: 'movie',
    sourceLabel: 'IMDb · Español',
  },
  {
    id: 'imdb-tt1375666',
    imdbId: 'tt1375666',
    title: 'El Origen (Inception)',
    aliases: ['inception', 'el origen', 'origen', 'dicaprio'],
    creator: 'Christopher Nolan',
    year: '2010',
    imdbRating: '8.8',
    imdbVotes: '2.5M votos',
    actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
    plot: 'Dom Cobb es un ladrón hábil en el arte de la extracción de secretos del subconsciente durante el sueño. Para recuperar su vida, acepta la misión inversa: implantar una idea en lo más profundo de la mente de un heredero corporativo.',
    overview:
      'Un ladrón que roba secretos corporativos mediante tecnología de sueños compartidos recibe la tarea inversa de implantar una idea.',
    releaseDate: '16 Jul 2010',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Película · IMDb 8.8 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_UX600_.jpg',
    tags: ['Ciencia Ficción', 'Acción', 'Suspense / Thriller'],
    mediaType: 'movie',
    sourceLabel: 'IMDb · Español',
  },
  {
    id: 'imdb-tt15239678',
    imdbId: 'tt15239678',
    title: 'Dune: Parte Dos',
    aliases: ['dune', 'duna', 'dune 2', 'dune parte dos', 'villeneuve'],
    creator: 'Denis Villeneuve',
    year: '2024',
    imdbRating: '8.5',
    imdbVotes: '540K votos',
    actors: 'Timothée Chalamet, Zendaya, Rebecca Ferguson',
    plot: 'Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia, enfrentándose a una elección entre el amor de su vida y el destino del universo.',
    overview:
      'Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia.',
    releaseDate: '01 Mar 2024',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Película · IMDb 8.5 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BNTc0YmQxMjEtODI5MC00NjFiLTlkMWUtOGQ5NjFmYWUyZGJhXkEyXkFqcGc@._V1_UX600_.jpg',
    tags: ['Ciencia Ficción', 'Aventura', 'Drama'],
    mediaType: 'movie',
    sourceLabel: 'IMDb · Español',
  },
  {
    id: 'imdb-tt15398776',
    imdbId: 'tt15398776',
    title: 'Oppenheimer',
    aliases: ['oppenheimer', 'cillian murphy', 'nolan'],
    creator: 'Christopher Nolan',
    year: '2023',
    imdbRating: '8.3',
    imdbVotes: '780K votos',
    actors: 'Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.',
    plot: 'La historia del físico estadounidense J. Robert Oppenheimer, su papel al frente del Proyecto Manhattan y el desarrollo de la bomba atómica durante la Segunda Guerra Mundial.',
    overview:
      'La historia del físico estadounidense J. Robert Oppenheimer y el desarrollo de la bomba atómica durante la Segunda Guerra Mundial.',
    releaseDate: '21 Jul 2023',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Película · IMDb 8.3 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BN2JkMDc5MGQtZjg3YS00NmFiLWIyZmQtZTJmNTM5MjVmYTQ4XkEyXkFqcGc@._V1_UX600_.jpg',
    tags: ['Biografía', 'Drama', 'Historia'],
    mediaType: 'movie',
    sourceLabel: 'IMDb · Español',
  },
  {
    id: 'imdb-tt11280740',
    imdbId: 'tt11280740',
    title: 'Severance',
    aliases: ['severance', 'separacion', 'lumon', 'adam scott'],
    creator: 'Dan Erickson, Ben Stiller',
    year: '2022',
    imdbRating: '8.7',
    imdbVotes: '225K votos',
    actors: 'Adam Scott, Britt Lower, Patricia Arquette, John Turturro',
    plot: 'Mark lidera un equipo de oficinistas en Lumon Industries cuyos recuerdos han sido divididos quirúrgicamente entre su vida laboral y su vida personal, hasta que un misterioso colega desencadena la búsqueda de la verdad.',
    overview:
      'Un equipo de oficinistas cuyos recuerdos han sido divididos quirúrgicamente entre su trabajo y su vida personal descubre una conspiración.',
    releaseDate: '18 Feb 2022',
    isFutureRelease: false,
    isPastRelease: true,
    releaseStatus: 'released',
    releaseFormat: 'Serie TV · IMDb 8.7 ★',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BZDI5YzJhODQtMzQyNy00YWNmLWIxMjUtNDBjNjA5YWRjMzExXkEyXkFqcGc@._V1_UX600_.jpg',
    tags: ['Ciencia Ficción', 'Misterio', 'Drama'],
    mediaType: 'series',
    sourceLabel: 'IMDb · Español',
  },
];

/**
 * Synchronous 0ms lookup that returns cached or curated Spanish matches immediately
 * while the background API fetch refines the results.
 */
export function getInstantMediaSuggestions(
  query: string,
  vaultGroup: Exclude<VaultFilterId, 'todo'>
): MediaSearchResult[] {
  const norm = normalizeSearchQuery(query);
  if (norm.length < 2) return [];

  loadSessionCache();
  const exactKey = `${vaultGroup}:${norm}`;
  const exactHit = MEMORY_SEARCH_CACHE.get(exactKey);
  if (exactHit && Date.now() - exactHit.timestamp < CACHE_TTL_MS) {
    return exactHit.results;
  }

  const instantList: MediaSearchResult[] = [];
  const seenIds = new Set<string>();

  if (vaultGroup === 'peliculas_series' || vaultGroup === 'proximamente') {
    for (const item of SPANISH_INSTANT_CATALOG) {
      const normTitle = normalizeSearchQuery(item.title);
      const matchesTitle = normTitle.includes(norm) || norm.includes(normTitle);
      const matchesAlias = item.aliases.some(
        (al) => al.includes(norm) || norm.includes(al)
      );
      if (matchesTitle || matchesAlias) {
        const { aliases: _aliases, ...cleanItem } = item;
        instantList.push(cleanItem);
        seenIds.add(cleanItem.id);
      }
    }
  }

  // Also check prefix cache hits from earlier keystrokes
  for (const [key, entry] of MEMORY_SEARCH_CACHE.entries()) {
    if (!key.startsWith(`${vaultGroup}:`)) continue;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) continue;
    for (const r of entry.results) {
      if (seenIds.has(r.id)) continue;
      const rTitle = normalizeSearchQuery(r.title);
      const rCreator = normalizeSearchQuery(r.creator);
      if (rTitle.includes(norm) || rCreator.includes(norm)) {
        instantList.push(r);
        seenIds.add(r.id);
      }
    }
  }

  return instantList.slice(0, 6);
}

async function withFastTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } catch {
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 1A. Official IMDb / OMDb Search (supports searching by title or by exact `imdbID` like `tt0816692`)
 */
async function searchImdbMedia(query: string): Promise<MediaSearchResult[]> {
  const imdbRecords = await searchImdbDatabase(query);
  return imdbRecords.map((rec) => {
    const rawDateSource = rec.released || rec.year;
    const countdown = rawDateSource
      ? computeReleaseCountdown(rawDateSource)
      : null;
    const { date: parsedDate, isYearOnly } =
      parseFlexibleDateToLocalMidnight(rawDateSource);
    const hasExactDate = Boolean(parsedDate && !isYearOnly);
    const esGenres =
      rec.genres.length > 0
        ? rec.genres.map((g) => translateGenreEs(g))
        : ['Cine'];

    return {
      id: rec.id,
      imdbId: rec.imdbId,
      imdbRating: rec.imdbRating,
      imdbVotes: rec.imdbVotes,
      actors: rec.actors,
      plot: rec.plot,
      title: rec.title,
      creator: rec.director,
      year: rec.year,
      releaseDate: countdown?.formattedDate,
      rawReleaseDate: hasExactDate ? countdown?.isoDate : undefined,
      daysRemaining: countdown?.daysRemaining,
      isFutureRelease: countdown ? countdown.isFuture : false,
      isPastRelease: countdown ? countdown.isPast : false,
      releaseStatus: countdown
        ? countdown.isFuture
          ? 'upcoming'
          : 'released'
        : 'unknown',
      releaseFormat:
        rec.mediaType === 'series'
          ? `Serie TV · IMDb ${rec.imdbRating} ★`
          : `Película · IMDb ${rec.imdbRating} ★`,
      imageUrl: rec.posterUrl,
      tags: esGenres,
      mediaType: rec.mediaType,
      sourceLabel: rec.sourceLabel,
      overview: rec.plot,
    };
  });
}

/**
 * 1B. TMDB Multi-Search (via server proxy /api/media/tmdb configured with language=es-ES / es-MX)
 */
async function searchTmdbMulti(
  query: string,
  upcomingPriority = false
): Promise<MediaSearchResult[]> {
  try {
    const res = await fetch(
      `/api/media/tmdb?q=${encodeURIComponent(query.trim())}${
        upcomingPriority ? '&mode=upcoming' : ''
      }`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.enabled || !Array.isArray(data?.results)) return [];

    return data.results.map((item: any) => {
      const rawDate = item.rawReleaseDate || item.releaseDate || '';
      const countdown = rawDate ? computeReleaseCountdown(rawDate) : null;
      return {
        id: String(item.id),
        title: String(item.title),
        creator: String(item.creator || 'TMDB'),
        year: String(item.year || ''),
        releaseDate: countdown?.formattedDate,
        rawReleaseDate: countdown?.isoDate || rawDate || undefined,
        daysRemaining: countdown?.daysRemaining,
        isFutureRelease: countdown
          ? countdown.isFuture
          : Boolean(item.isFutureRelease),
        isPastRelease: countdown
          ? countdown.isPast
          : Boolean(item.isPastRelease),
        releaseStatus:
          item.releaseStatus ||
          (countdown
            ? countdown.isFuture
              ? 'upcoming'
              : 'released'
            : 'unknown'),
        releaseFormat:
          item.mediaType === 'series' ? 'Serie TV · TMDB' : 'Película · Cine',
        imageUrl: item.imageUrl,
        tags: Array.isArray(item.tags)
          ? item.tags.map((t: string) => translateGenreEs(t))
          : ['Cine'],
        mediaType: item.mediaType === 'series' ? 'series' : 'movie',
        sourceLabel: 'TMDB Español',
        overview: item.overview || '',
        plot: item.overview || undefined,
      };
    });
  } catch {
    return [];
  }
}

/**
 * 1C. Keyless Fallback for Movies in Spanish: iTunes Search API (country=MX&lang=es_mx + country=ES&lang=es_es)
 */
async function searchItunesMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const qEncoded = encodeURIComponent(query.trim());
    const [mxRes, esRes] = await Promise.all([
      fetch(
        `https://itunes.apple.com/search?media=movie&country=MX&lang=es_mx&limit=5&term=${qEncoded}`
      ),
      fetch(
        `https://itunes.apple.com/search?media=movie&country=ES&lang=es_es&limit=5&term=${qEncoded}`
      ),
    ]);
    const mxData = mxRes.ok ? await mxRes.json() : {};
    const esData = esRes.ok ? await esRes.json() : {};
    const list: any[] = [
      ...(Array.isArray(mxData?.results) ? mxData.results : []),
      ...(Array.isArray(esData?.results) ? esData.results : []),
    ];

    const seenTrackIds = new Set<string>();
    return list
      .filter((r) => {
        if (!r?.trackName) return false;
        const key = String(r.trackId || r.trackName.toLowerCase());
        if (seenTrackIds.has(key)) return false;
        seenTrackIds.add(key);
        return true;
      })
      .slice(0, 6)
      .map((r) => {
        const rawDate = r.releaseDate ? String(r.releaseDate).slice(0, 10) : '';
        const year = rawDate ? rawDate.slice(0, 4) : '';
        const countdown = rawDate ? computeReleaseCountdown(rawDate) : null;
        const genre = translateGenreEs(
          r.primaryGenreName ? String(r.primaryGenreName) : 'Cine'
        );
        const esPlot =
          r.longDescription ||
          r.shortDescription ||
          `Película de ${genre.toLowerCase()} dirigida por ${
            r.artistName || 'Director destacado'
          } (${year || 'Cine'}).`;
        return {
          id: `itunes-movie-${r.trackId || Math.random()}`,
          title: String(r.trackName),
          creator: String(r.artistName || 'Director Destacado'),
          year,
          releaseDate: countdown?.formattedDate,
          rawReleaseDate: countdown?.isoDate || rawDate || undefined,
          daysRemaining: countdown?.daysRemaining,
          isFutureRelease: countdown ? countdown.isFuture : false,
          isPastRelease: countdown ? countdown.isPast : false,
          releaseStatus: countdown
            ? countdown.isFuture
              ? 'upcoming'
              : 'released'
            : 'unknown',
          releaseFormat: `Película · ${genre}`,
          imageUrl: upgradeItunesArtwork(r.artworkUrl100),
          tags: [genre, 'Cine', year].filter(Boolean),
          mediaType: 'movie' as const,
          sourceLabel: 'Catálogo Español',
          overview: esPlot,
          plot: esPlot,
        };
      });
  } catch {
    return [];
  }
}

/**
 * 1D. Keyless Fallback for Series: TVMaze Public API + Spanish Genre Localization
 */
async function searchTvMazeSeries(query: string): Promise<MediaSearchResult[]> {
  try {
    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(
      query.trim()
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any[] = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .slice(0, 5)
      .filter((entry) => entry?.show?.name)
      .map((entry) => {
        const show = entry.show;
        const rawDate = show.premiered
          ? String(show.premiered).slice(0, 10)
          : '';
        const year = rawDate ? rawDate.slice(0, 4) : '';
        const isInDevelopment =
          show.status === 'In Development' ||
          show.status === 'To Be Determined';
        const countdown = rawDate ? computeReleaseCountdown(rawDate) : null;
        const isFuture = Boolean(countdown?.isFuture || isInDevelopment);
        const isPast = Boolean(!isFuture && countdown?.isPast);
        const network =
          show.network?.name || show.webChannel?.name || 'Serie TV';
        const genres: string[] = Array.isArray(show.genres)
          ? show.genres.slice(0, 3).map((g: string) => translateGenreEs(g))
          : ['Serie'];
        const poster =
          show.image?.original ||
          show.image?.medium?.replace('http://', 'https://');
        const imdbId = show.externals?.imdb
          ? String(show.externals.imdb)
          : undefined;
        const imdbRating = show.rating?.average
          ? Number(show.rating.average).toFixed(1)
          : undefined;
        const rawSummary = show.summary
          ? String(show.summary).replace(/<[^>]+>/g, '').trim()
          : '';
        const plot =
          rawSummary ||
          `Serie de televisión (${genres.join(', ')}) emitida por ${network}${
            year ? ` (${year})` : ''
          }.`;

        return {
          id: `tvmaze-${show.id}`,
          imdbId,
          imdbRating,
          plot,
          overview: plot,
          title: String(show.name),
          creator: String(network),
          year,
          releaseDate: countdown?.formattedDate,
          rawReleaseDate: countdown?.isoDate || rawDate || undefined,
          daysRemaining: countdown?.daysRemaining,
          isFutureRelease: isFuture,
          isPastRelease: isPast,
          releaseStatus: isFuture
            ? 'upcoming'
            : isPast
            ? 'released'
            : 'unknown',
          releaseFormat: `Serie · ${network}`,
          imageUrl: poster,
          tags: genres.length > 0 ? genres : ['Serie', network],
          mediaType: 'series' as const,
          sourceLabel: imdbId ? 'IMDb · Serie' : 'Serie TV',
        };
      });
  } catch {
    return [];
  }
}

/**
 * 2. Anime Search: Jikan API v4 (Keyless MyAnimeList Official API)
 */
export async function searchJikanAnime(
  query: string
): Promise<MediaSearchResult[]> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(
      query.trim()
    )}&limit=4&sfw=true`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const list: any[] = Array.isArray(json?.data) ? json.data : [];

    return list
      .filter((a) => a.title)
      .map((a) => {
        const rawDate = a.aired?.from ? String(a.aired.from).slice(0, 10) : '';
        const year =
          String(a.year || '') || (rawDate ? rawDate.slice(0, 4) : '');
        const countdown = rawDate ? computeReleaseCountdown(rawDate) : null;
        const isNotYetAired = a.status === 'Not yet aired';
        const isFuture = Boolean(isNotYetAired || countdown?.isFuture);
        const isPast = Boolean(!isFuture && countdown?.isPast);
        const studio =
          Array.isArray(a.studios) && a.studios[0]?.name
            ? a.studios[0].name
            : 'Estudio de Anime';
        const genres = Array.isArray(a.genres)
          ? a.genres
              .slice(0, 3)
              .map((g: any) => translateGenreEs(String(g.name)))
          : ['Anime'];
        const poster =
          a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
        const score = a.score ? Number(a.score).toFixed(1) : undefined;
        const spanishTitle =
          (Array.isArray(a.titles)
            ? a.titles.find((t: any) => t.type === 'Spanish')?.title
            : undefined) ||
          a.title_english ||
          a.title;
        const plot = a.synopsis
          ? String(a.synopsis).slice(0, 350)
          : `Producción de animación de ${studio} (${year || 'Anime'}) · Género: ${genres.join(', ')}.`;

        return {
          id: `jikan-${a.mal_id}`,
          imdbRating: score,
          plot,
          overview: plot,
          title: String(spanishTitle),
          creator: String(studio),
          year,
          releaseDate: countdown?.formattedDate,
          rawReleaseDate: countdown?.isoDate || rawDate || undefined,
          daysRemaining: countdown?.daysRemaining,
          isFutureRelease: isFuture,
          isPastRelease: isPast,
          releaseStatus: isFuture
            ? 'upcoming'
            : isPast
            ? 'released'
            : 'unknown',
          releaseFormat: `Anime · ${studio}`,
          imageUrl: poster,
          tags: ['Anime', ...genres].slice(0, 3),
          mediaType: 'anime' as const,
          sourceLabel: 'Anime · Jikan',
        };
      });
  } catch {
    return [];
  }
}

/**
 * 3. Music Search (Songs & Albums): iTunes Public API with 600x600bb cover & 30s previewUrl
 */
export async function searchItunesMusic(
  query: string
): Promise<MediaSearchResult[]> {
  try {
    const url = `https://itunes.apple.com/search?media=music&country=MX&lang=es_mx&entity=song,album&limit=8&term=${encodeURIComponent(
      query.trim()
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.results) ? data.results : [];

    return list
      .filter((r) => r.trackName || r.collectionName)
      .map((r) => {
        const isAlbum = r.wrapperType === 'collection';
        const title = isAlbum
          ? String(r.collectionName)
          : String(r.trackName || r.collectionName);
        const artist = String(r.artistName || 'Artista');
        const albumName = r.collectionName ? String(r.collectionName) : '';
        const rawDate = r.releaseDate || '';
        const year = rawDate ? rawDate.slice(0, 4) : '';
        const genre = r.primaryGenreName
          ? String(r.primaryGenreName)
          : 'Música';

        const spotifySearchLink = `https://open.spotify.com/search/${encodeURIComponent(
          `${title} ${artist}`
        )}`;

        return {
          id: `itunes-music-${r.trackId || r.collectionId || Math.random()}`,
          title,
          creator:
            !isAlbum && albumName && albumName !== title
              ? `${artist} · ${albumName}`
              : artist,
          year,
          releaseDate: year,
          imageUrl: upgradeItunesArtwork(r.artworkUrl100),
          audioPreviewUrl: r.previewUrl ? String(r.previewUrl) : undefined,
          videoUrl: spotifySearchLink,
          plot: isAlbum
            ? `Álbum "${title}" de ${artist} (${year || 'Música'}).`
            : `Canción "${title}" de ${artist}${albumName ? ` · Álbum: ${albumName}` : ''}.`,
          tags: [genre, isAlbum ? 'Álbum' : 'Spotify', year].filter(Boolean),
          mediaType: isAlbum ? ('album' as const) : ('song' as const),
          sourceLabel: 'Spotify · Música',
        };
      });
  } catch {
    return [];
  }
}

/**
 * 4. YouTube Videos: NoEmbed Public OEmbed API (extracts title, author_name, thumbnail_url)
 */
export async function searchNoembedVideo(
  input: string
): Promise<MediaSearchResult[]> {
  const trimmed = input.trim();
  const isUrl =
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('youtube.com/') ||
    trimmed.includes('youtu.be/');

  const targetUrl = isUrl
    ? trimmed.startsWith('http')
      ? trimmed
      : `https://${trimmed}`
    : '';

  if (!targetUrl) {
    return [];
  }

  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || data.error || !data.title) return [];

    return [
      {
        id: `noembed-${Date.now()}`,
        title: String(data.title),
        creator: String(data.author_name || data.provider_name || 'YouTube'),
        year: new Date().getFullYear().toString(),
        imageUrl: data.thumbnail_url ? String(data.thumbnail_url) : undefined,
        videoUrl: targetUrl,
        tags: ['YouTube', String(data.author_name || 'Video'), 'Ensayo'].slice(
          0,
          3
        ),
        mediaType: 'video',
        sourceLabel: 'YouTube NoEmbed',
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Unified Live Search Function by Vault Category with Client Caching & Fast Timeouts
 */
export async function searchMediaByCategory(
  query: string,
  vaultGroup: Exclude<VaultFilterId, 'todo'>,
  includeAnime = true
): Promise<MediaSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const normKey = `${vaultGroup}:${normalizeSearchQuery(q)}`;
  loadSessionCache();
  const cachedHit = MEMORY_SEARCH_CACHE.get(normKey);
  if (cachedHit && Date.now() - cachedHit.timestamp < CACHE_TTL_MS) {
    return cachedHit.results;
  }

  if (vaultGroup === 'musica') {
    const [spotifyResults, itunesResults] = await Promise.all([
      withFastTimeout(searchSpotifyCatalog(q, true), 2000, []),
      withFastTimeout(searchItunesMusic(q), 2000, []),
    ]);

    if (spotifyResults.length > 0) {
      const mergedMusic: MediaSearchResult[] = spotifyResults.map((sp) => {
        if (!sp.audioPreviewUrl) {
          const matchingItunes = itunesResults.find(
            (it) =>
              it.title.toLowerCase() === sp.title.toLowerCase() &&
              Boolean(it.audioPreviewUrl)
          );
          if (matchingItunes?.audioPreviewUrl) {
            return { ...sp, audioPreviewUrl: matchingItunes.audioPreviewUrl };
          }
        }
        return sp;
      });
      const finalMusic = mergedMusic.slice(0, 8);
      saveToSearchCache(normKey, finalMusic);
      return finalMusic;
    }

    saveToSearchCache(normKey, itunesResults);
    return itunesResults;
  }

  if (vaultGroup === 'videos') {
    const vidResults = await searchNoembedVideo(q);
    saveToSearchCache(normKey, vidResults);
    return vidResults;
  }

  if (vaultGroup === 'peliculas_series' || vaultGroup === 'proximamente') {
    const isUpcomingSearch = vaultGroup === 'proximamente';

    if (/^tt\d{5,12}$/i.test(q)) {
      const idResults = await searchImdbMedia(q);
      saveToSearchCache(normKey, idResults);
      return idResults;
    }

    // Query providers concurrently with fast 2000ms timeouts so slow endpoints never stall UI
    const [imdbResults, tmdbResults, movies, series, anime] = await Promise.all(
      [
        withFastTimeout(searchImdbMedia(q), 2200, []),
        withFastTimeout(searchTmdbMulti(q, isUpcomingSearch), 2000, []),
        withFastTimeout(searchItunesMovies(q), 2000, []),
        withFastTimeout(searchTvMazeSeries(q), 2000, []),
        includeAnime
          ? withFastTimeout(searchJikanAnime(q), 1800, [])
          : Promise.resolve([]),
      ]
    );

    const instantMatches = getInstantMediaSuggestions(q, vaultGroup);
    const seenTitles = new Set<string>();
    const merged: MediaSearchResult[] = [];

    const pushUnique = (item: MediaSearchResult) => {
      const key = `${normalizeSearchQuery(item.title)}-${item.year}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        merged.push(item);
      }
    };

    if (isUpcomingSearch) {
      tmdbResults.forEach(pushUnique);
      imdbResults.forEach(pushUnique);
      movies.forEach(pushUnique);
      series.forEach(pushUnique);
      anime.forEach(pushUnique);
      instantMatches.forEach(pushUnique);

      const currentYear = new Date().getFullYear();
      merged.sort((a, b) => {
        const aFuture =
          a.isFutureRelease || a.releaseStatus === 'upcoming' ? 2 : 0;
        const bFuture =
          b.isFutureRelease || b.releaseStatus === 'upcoming' ? 2 : 0;
        if (aFuture !== bFuture) return bFuture - aFuture;

        const aYear = parseInt(a.year || '0', 10) || 0;
        const bYear = parseInt(b.year || '0', 10) || 0;
        const aRecentOrFutureYear = aYear >= currentYear ? 1 : 0;
        const bRecentOrFutureYear = bYear >= currentYear ? 1 : 0;
        if (aRecentOrFutureYear !== bRecentOrFutureYear) {
          return bRecentOrFutureYear - aRecentOrFutureYear;
        }
        return bYear - aYear;
      });

      const finalUpcoming = merged.slice(0, 8);
      saveToSearchCache(normKey, finalUpcoming);
      return finalUpcoming;
    }

    // Prioritize curated Spanish matches, TMDB Español, iTunes Español, and IMDb Español
    instantMatches.forEach(pushUnique);
    tmdbResults.forEach(pushUnique);
    imdbResults.forEach(pushUnique);
    movies.forEach(pushUnique);
    series.forEach(pushUnique);
    anime.forEach(pushUnique);

    const finalMovies = merged.slice(0, 8);
    saveToSearchCache(normKey, finalMovies);
    return finalMovies;
  }

  return [];
}

/**
 * Automatic Best Match Finder for the AI Assistant (enriches natural language commands with IMDb ID, rating, cast, synopsis, and poster)
 */
export async function findBestMediaMatch(
  titleOrImdbId: string,
  vaultGroup: Exclude<VaultFilterId, 'todo'>,
  categoryHint?: string,
  explicitImdbId?: string,
  creatorHint?: string
): Promise<MediaSearchResult | null> {
  const cleanTitle = (explicitImdbId || titleOrImdbId).trim();
  if (!cleanTitle || vaultGroup === 'personas' || vaultGroup === 'momentos') {
    return null;
  }

  try {
    // 1. For Movies & Series, check IMDb / OMDb first to capture official imdbId, imdbRating, actors, plot & poster
    if (vaultGroup === 'peliculas_series' || vaultGroup === 'proximamente') {
      const imdbDetail = await fetchImdbDetailsByQueryOrId(cleanTitle);
      if (imdbDetail) {
        const rawDateSource = imdbDetail.released || imdbDetail.year;
        const countdown = computeReleaseCountdown(rawDateSource);
        return {
          id: imdbDetail.id,
          imdbId: imdbDetail.imdbId,
          imdbRating: imdbDetail.imdbRating,
          imdbVotes: imdbDetail.imdbVotes,
          actors: imdbDetail.actors,
          plot: imdbDetail.plot,
          title: imdbDetail.title,
          creator: imdbDetail.director,
          year: imdbDetail.year,
          releaseDate: countdown.formattedDate,
          rawReleaseDate: countdown.isoDate,
          daysRemaining: countdown.daysRemaining,
          isFutureRelease: countdown.isFuture,
          isPastRelease: countdown.isPast,
          releaseStatus: countdown.isFuture ? 'upcoming' : 'released',
          releaseFormat:
            imdbDetail.mediaType === 'series'
              ? `Serie TV · IMDb ${imdbDetail.imdbRating} ★`
              : `Película · IMDb ${imdbDetail.imdbRating} ★`,
          imageUrl: imdbDetail.posterUrl,
          tags: imdbDetail.genres,
          mediaType: imdbDetail.mediaType,
          sourceLabel: imdbDetail.sourceLabel,
          overview: imdbDetail.plot,
        };
      }
    }

    const isAnimeHint =
      categoryHint?.toLowerCase().includes('anime') ||
      cleanTitle.toLowerCase().includes('anime');

    if (
      isAnimeHint &&
      (vaultGroup === 'peliculas_series' || vaultGroup === 'proximamente')
    ) {
      const animeMatches = await searchJikanAnime(cleanTitle);
      if (animeMatches.length > 0) return animeMatches[0];
    }

    // 1.5. For Música (Songs, Albums, or Spotify Playlists), check user's connected Spotify playlists first if it's a playlist request, then Spotify Search API
    if (vaultGroup === 'musica') {
      const isPlaylistQuery =
        categoryHint?.toLowerCase().includes('playlist') ||
        creatorHint?.toLowerCase().includes('playlist') ||
        cleanTitle.toLowerCase().includes('playlist');
      const strippedPlaylistName = cleanTitle
        .replace(/^(?:mi\s+)?playlist\s+(?:de\s+spotify\s*)?/i, '')
        .replace(/\s+de\s+spotify$/i, '')
        .trim();

      if (isPlaylistQuery) {
        try {
          const userPlaylists = await fetchUserSpotifyPlaylists();
          const lowerTargetPl = (
            strippedPlaylistName || cleanTitle
          ).toLowerCase();
          const foundUserPl = userPlaylists.find(
            (pl) =>
              pl.name.toLowerCase() === lowerTargetPl ||
              pl.name.toLowerCase().includes(lowerTargetPl) ||
              lowerTargetPl.includes(pl.name.toLowerCase())
          );
          if (foundUserPl) {
            return {
              id: `spotify-pl-${foundUserPl.id}`,
              title: foundUserPl.name,
              creator: `Playlist de ${foundUserPl.ownerName}`,
              year: new Date().getFullYear().toString(),
              imageUrl: foundUserPl.imageUrl,
              videoUrl: foundUserPl.spotifyUrl,
              plot:
                foundUserPl.description ||
                `Playlist de Spotify con ${foundUserPl.tracksTotal} canciones curadas por ${foundUserPl.ownerName}.`,
              tags: [
                'Spotify',
                'Playlist',
                `${foundUserPl.tracksTotal} tracks`,
              ],
              mediaType: 'album',
              sourceLabel: 'Spotify Playlist',
            };
          }
        } catch {
          // User may not be authenticated with Spotify yet; fall through to catalog search
        }
      }

      const cleanCreatorHint =
        creatorHint &&
        !creatorHint.includes('Assistant') &&
        !creatorHint.includes('Playlist') &&
        !creatorHint.includes('Desconocido')
          ? creatorHint.trim()
          : '';

      const combinedMusicQuery =
        cleanCreatorHint &&
        !cleanTitle.toLowerCase().includes(cleanCreatorHint.toLowerCase())
          ? `${strippedPlaylistName || cleanTitle} ${cleanCreatorHint}`
          : strippedPlaylistName || cleanTitle;

      const spotifyMatches = await searchSpotifyCatalog(
        combinedMusicQuery,
        true
      );
      if (spotifyMatches.length > 0) {
        if (isPlaylistQuery) {
          const plMatch = spotifyMatches.find((m) =>
            m.id.startsWith('spotify-playlist-')
          );
          if (plMatch) return plMatch;
        }
        return spotifyMatches[0];
      }
    }

    const results = await searchMediaByCategory(cleanTitle, vaultGroup, true);
    if (results.length === 0) return null;

    const lowerTarget = cleanTitle.toLowerCase();
    const withImage = results.filter((r) => Boolean(r.imageUrl));
    const exactMatch = withImage.find(
      (r) =>
        r.title.toLowerCase() === lowerTarget ||
        r.title.toLowerCase().includes(lowerTarget)
    );

    return exactMatch || withImage[0] || results[0];
  } catch {
    return null;
  }
}
