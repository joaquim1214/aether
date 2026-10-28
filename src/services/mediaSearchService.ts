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
      tags: rec.genres.length > 0 ? rec.genres : ['Cine'],
      mediaType: rec.mediaType,
      sourceLabel: rec.sourceLabel,
      overview: rec.plot,
    };
  });
}

/**
 * 1B. TMDB Multi-Search (via server proxy /api/media/tmdb when TMDB_API_KEY is configured)
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
        tags: Array.isArray(item.tags) ? item.tags : ['Cine'],
        mediaType: item.mediaType === 'series' ? 'series' : 'movie',
        sourceLabel: 'TMDB',
        overview: item.overview || '',
        plot: item.overview || undefined,
      };
    });
  } catch {
    return [];
  }
}

/**
 * 1C. Keyless Fallback for Movies: iTunes Search API (media=movie)
 */
async function searchItunesMovies(query: string): Promise<MediaSearchResult[]> {
  try {
    const url = `https://itunes.apple.com/search?media=movie&limit=5&term=${encodeURIComponent(
      query.trim()
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.results) ? data.results : [];

    return list
      .filter((r) => r.trackName)
      .map((r) => {
        const rawDate = r.releaseDate ? String(r.releaseDate).slice(0, 10) : '';
        const year = rawDate ? rawDate.slice(0, 4) : '';
        const countdown = rawDate ? computeReleaseCountdown(rawDate) : null;
        const genre = r.primaryGenreName ? String(r.primaryGenreName) : 'Cine';
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
          sourceLabel: 'iTunes Cine',
          overview: r.longDescription || r.shortDescription || '',
          plot: r.longDescription || r.shortDescription || undefined,
        };
      });
  } catch {
    return [];
  }
}

/**
 * 1D. Keyless Fallback for Series: TVMaze Public API (includes official externals.imdb ID & rating)
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
        const rawDate = show.premiered ? String(show.premiered).slice(0, 10) : '';
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
          ? show.genres.slice(0, 3)
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
        const plot = show.summary
          ? String(show.summary).replace(/<[^>]+>/g, '').trim()
          : undefined;

        return {
          id: `tvmaze-${show.id}`,
          imdbId,
          imdbRating,
          plot,
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
          sourceLabel: imdbId ? 'IMDb · TVMaze' : 'TVMaze',
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
    )}&limit=5&sfw=true`;
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
            : 'Anime Studio';
        const genres = Array.isArray(a.genres)
          ? a.genres.slice(0, 3).map((g: any) => String(g.name))
          : ['Anime'];
        const poster =
          a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
        const score = a.score ? Number(a.score).toFixed(1) : undefined;

        return {
          id: `jikan-${a.mal_id}`,
          imdbRating: score,
          plot: a.synopsis ? String(a.synopsis).slice(0, 350) : undefined,
          title: String(a.title_english || a.title),
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
          sourceLabel: 'Jikan Anime',
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
    const url = `https://itunes.apple.com/search?media=music&entity=song,album&limit=8&term=${encodeURIComponent(
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
 * Unified Live Search Function by Vault Category (Prioritizing IMDb/OMDb for Películas & Series)
 */
export async function searchMediaByCategory(
  query: string,
  vaultGroup: Exclude<VaultFilterId, 'todo'>,
  includeAnime = true
): Promise<MediaSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  if (vaultGroup === 'musica') {
    const [spotifyResults, itunesResults] = await Promise.all([
      searchSpotifyCatalog(q, true),
      searchItunesMusic(q),
    ]);

    if (spotifyResults.length > 0) {
      // Enrich Spotify tracks without preview_url using matching iTunes previewUrl if available
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
      return mergedMusic.slice(0, 8);
    }

    return itunesResults;
  }

  if (vaultGroup === 'videos') {
    return searchNoembedVideo(q);
  }

  if (vaultGroup === 'peliculas_series' || vaultGroup === 'proximamente') {
    const isUpcomingSearch = vaultGroup === 'proximamente';

    // If the user typed an exact IMDb ID (e.g. tt0816692), query IMDb directly
    if (/^tt\d{5,12}$/i.test(q)) {
      return searchImdbMedia(q);
    }

    // Query IMDb/OMDb, TMDB, TVMaze, iTunes, and Jikan in parallel so results always include IMDb ratings, cast, & posters
    const [imdbResults, tmdbResults, movies, series, anime] = await Promise.all(
      [
        searchImdbMedia(q),
        searchTmdbMulti(q, isUpcomingSearch),
        searchItunesMovies(q),
        searchTvMazeSeries(q),
        includeAnime ? searchJikanAnime(q) : Promise.resolve([]),
      ]
    );

    const seenTitles = new Set<string>();
    const merged: MediaSearchResult[] = [];

    const pushUnique = (item: MediaSearchResult) => {
      const key = `${item.title.toLowerCase()}-${item.year}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        merged.push(item);
      }
    };

    if (isUpcomingSearch) {
      // When searching in Hype Radar (Próximamente), prioritize TMDB + TVMaze + Jikan + IMDb
      // and sort items whose status is Upcoming or whose release date is in the future first!
      tmdbResults.forEach(pushUnique);
      imdbResults.forEach(pushUnique);
      series.forEach(pushUnique);
      anime.forEach(pushUnique);
      movies.forEach(pushUnique);

      const currentYear = new Date().getFullYear();
      merged.sort((a, b) => {
        const aFuture = a.isFutureRelease || a.releaseStatus === 'upcoming' ? 2 : 0;
        const bFuture = b.isFutureRelease || b.releaseStatus === 'upcoming' ? 2 : 0;
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

      return merged.slice(0, 8);
    }

    // Standard Películas & Series Vistas order: prioritize IMDb results first
    imdbResults.forEach(pushUnique);
    tmdbResults.forEach(pushUnique);
    movies.forEach(pushUnique);
    series.forEach(pushUnique);
    anime.forEach(pushUnique);

    return merged.slice(0, 8);
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
