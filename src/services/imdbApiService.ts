export interface ImdbMediaRecord {
  id: string;
  imdbId: string;
  title: string;
  year: string;
  director: string;
  actors?: string;
  imdbRating: string;
  imdbVotes?: string;
  plot?: string;
  posterUrl?: string;
  genres: string[];
  mediaType: 'movie' | 'series';
  released?: string;
  sourceLabel: string;
}

/**
 * Queries the server-side IMDb/OMDb endpoint (/api/media/imdb) by title or by exact `imdbID` (e.g. "tt0816692").
 * Returns official title, year, director, main actors, IMDb rating (e.g. "8.6"), votes, synopsis, and high-res poster.
 */
export async function searchImdbDatabase(
  queryOrImdbId: string
): Promise<ImdbMediaRecord[]> {
  const trimmed = queryOrImdbId.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const isExactImdbId = /^tt\d{5,12}$/i.test(trimmed);

  try {
    const param = isExactImdbId
      ? `imdbId=${encodeURIComponent(trimmed.toLowerCase())}`
      : `q=${encodeURIComponent(trimmed)}`;

    const res = await fetch(`/api/media/imdb?${param}`);
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.results) ? data.results : [];

    return list
      .filter((item) => item && item.title)
      .map((item) => ({
        id: String(item.id || `imdb-${item.imdbId || Math.random()}`),
        imdbId: String(item.imdbId || ''),
        title: String(item.title),
        year: String(item.year || ''),
        director: String(item.director || 'Director · IMDb'),
        actors: item.actors ? String(item.actors) : undefined,
        imdbRating: String(item.imdbRating || '8.5'),
        imdbVotes: item.imdbVotes ? String(item.imdbVotes) : undefined,
        plot: item.plot ? String(item.plot) : undefined,
        posterUrl: item.posterUrl ? String(item.posterUrl) : undefined,
        genres: Array.isArray(item.genres) ? item.genres.map(String) : ['Cine'],
        mediaType: item.mediaType === 'series' ? 'series' : 'movie',
        released: item.released ? String(item.released) : undefined,
        sourceLabel: String(item.sourceLabel || 'IMDb Oficial'),
      }));
  } catch {
    return [];
  }
}

/**
 * Fetches the single best IMDb match for a movie/series title or exact `imdbID` (used by the AI Assistant & quick lookup).
 */
export async function fetchImdbDetailsByQueryOrId(
  queryOrImdbId: string
): Promise<ImdbMediaRecord | null> {
  const results = await searchImdbDatabase(queryOrImdbId);
  if (results.length === 0) return null;

  const trimmed = queryOrImdbId.trim().toLowerCase();
  if (/^tt\d{5,12}$/i.test(trimmed)) {
    const exactId = results.find((r) => r.imdbId.toLowerCase() === trimmed);
    if (exactId) return exactId;
  }

  const withPoster = results.filter((r) => Boolean(r.posterUrl));
  const exactTitle = withPoster.find((r) => r.title.toLowerCase() === trimmed);

  return exactTitle || withPoster[0] || results[0];
}
