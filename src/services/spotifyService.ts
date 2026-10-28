import { MediaSearchResult } from './mediaSearchService';

export interface SpotifyUserProfile {
  id: string;
  displayName: string;
  email?: string;
  imageUrl?: string;
  spotifyUrl?: string;
}

export interface SpotifyPlaylistItem {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  tracksTotal: number;
  imageUrl?: string;
  spotifyUrl: string;
  previewUrl?: string;
}

interface StoredSpotifyToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId?: string;
  profile?: SpotifyUserProfile;
}

const STORAGE_KEYS = {
  tokenData: 'aether_spotify_token_v1',
  pkceVerifier: 'aether_spotify_pkce_verifier_v1',
  customClientId: 'aether_spotify_client_id_v1',
};

const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-private',
].join(' ');

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generatePkceVerifier(length = 64): string {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

export async function generatePkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function getSpotifyRedirectUri(): string {
  return `${window.location.origin}/auth/spotify/callback`;
}

export function getStoredSpotifySession(): StoredSpotifyToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tokenData);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSpotifyToken;
    if (!parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSpotifyStoredProfile(): {
  displayName: string;
  imageUrl?: string;
} | null {
  const session = getStoredSpotifySession();
  if (!session?.profile) return null;
  return {
    displayName: session.profile.displayName,
    imageUrl: session.profile.imageUrl,
  };
}

export function setStoredSpotifyClientId(clientId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.customClientId, clientId.trim());
  } catch {
    // ignore
  }
}

export function saveSpotifySession(session: StoredSpotifyToken): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tokenData, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function disconnectSpotifySession(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.tokenData);
    localStorage.removeItem(STORAGE_KEYS.pkceVerifier);
  } catch {
    // ignore
  }
}

export function disconnectSpotify(): void {
  disconnectSpotifySession();
}

export async function resolveSpotifyClientId(
  overrideClientId?: string
): Promise<string> {
  if (overrideClientId && overrideClientId.trim()) {
    return overrideClientId.trim();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.customClientId);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // ignore
  }

  const session = getStoredSpotifySession();
  if (session?.clientId && session.clientId.trim()) {
    return session.clientId.trim();
  }

  const viteClientId = (import.meta as any).env?.VITE_SPOTIFY_CLIENT_ID;
  if (
    viteClientId &&
    typeof viteClientId === 'string' &&
    viteClientId.trim() &&
    viteClientId.trim() !== 'MY_SPOTIFY_CLIENT_ID'
  ) {
    return viteClientId.trim();
  }

  try {
    const res = await fetch('/api/spotify/config');
    if (res.ok) {
      const data = await res.json();
      if (data?.clientId && typeof data.clientId === 'string') {
        return data.clientId.trim();
      }
    }
  } catch {
    // ignore network error
  }

  return '';
}

/**
 * Starts the official Spotify OAuth 2.0 PKCE flow in a popup window.
 */
export async function startSpotifyPkcePopup(
  overrideClientId?: string
): Promise<{
  started: boolean;
  error?: string;
}> {
  const clientId = await resolveSpotifyClientId(overrideClientId);
  if (!clientId) {
    return { started: false, error: 'MISSING_CLIENT_ID' };
  }

  const verifier = generatePkceVerifier(64);
  const challenge = await generatePkceChallenge(verifier);
  const redirectUri = getSpotifyRedirectUri();

  localStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);
  setStoredSpotifyClientId(clientId);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });

  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  const popup = window.open(
    authorizeUrl,
    'spotify_oauth_popup',
    'width=520,height=720,menubar=no,toolbar=no,location=no,status=no'
  );

  if (!popup) {
    return {
      started: false,
      error: 'Permite las ventanas emergentes para autorizar Spotify.',
    };
  }

  return { started: true };
}

/**
 * Exchanges the authorization code + PKCE code_verifier for a Spotify access token
 * and fetches the authenticated Spotify user profile.
 */
export async function completeSpotifyPkceHandshake(code: string): Promise<{
  ok: boolean;
  profile?: { displayName: string; imageUrl?: string };
  error?: string;
}> {
  try {
    const clientId = await resolveSpotifyClientId();
    const verifier = localStorage.getItem(STORAGE_KEYS.pkceVerifier) || '';
    const redirectUri = getSpotifyRedirectUri();

    const tokenRes = await fetch('/api/spotify/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        codeVerifier: verifier,
        redirectUri,
        clientId,
      }),
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.json().catch(() => ({}));
      return {
        ok: false,
        error:
          errData?.error_description ||
          errData?.error ||
          'No se pudo completar el intercambio PKCE con Spotify',
      };
    }

    const tokenPayload = await tokenRes.json();
    const accessToken = String(tokenPayload.access_token || '');
    const refreshToken = tokenPayload.refresh_token
      ? String(tokenPayload.refresh_token)
      : undefined;
    const expiresIn = Number(tokenPayload.expires_in) || 3600;
    const expiresAt = Date.now() + (expiresIn - 90) * 1000;

    let profile: SpotifyUserProfile = {
      id: 'spotify-user',
      displayName: 'Cuenta Spotify',
    };
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        profile = {
          id: String(me.id || 'spotify-user'),
          displayName: String(me.display_name || me.id || 'Spotify User'),
          email: me.email ? String(me.email) : undefined,
          imageUrl:
            Array.isArray(me.images) && me.images[0]?.url
              ? String(me.images[0].url)
              : undefined,
          spotifyUrl: me.external_urls?.spotify
            ? String(me.external_urls.spotify)
            : undefined,
        };
      }
    } catch {
      // ignore profile fetch error
    }

    const session: StoredSpotifyToken = {
      accessToken,
      refreshToken,
      expiresAt,
      clientId,
      profile,
    };
    saveSpotifySession(session);
    return {
      ok: true,
      profile: {
        displayName: profile.displayName,
        imageUrl: profile.imageUrl,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Error al vincular con Spotify',
    };
  }
}

/**
 * Forces a refresh of the Spotify OAuth PKCE access token using the stored refresh_token.
 */
export async function refreshSpotifyAccessToken(
  existingSession?: StoredSpotifyToken | null
): Promise<string | null> {
  const session = existingSession || getStoredSpotifySession();
  if (!session?.refreshToken) {
    return null;
  }

  try {
    const clientId = session.clientId || (await resolveSpotifyClientId());
    if (!clientId) return null;

    const res = await fetch('/api/spotify/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: 'refresh_token',
        refreshToken: session.refreshToken,
        clientId,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (!data?.access_token) return null;

    const updated: StoredSpotifyToken = {
      ...session,
      clientId,
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token
        ? String(data.refresh_token)
        : session.refreshToken,
      expiresAt: Date.now() + ((Number(data.expires_in) || 3600) - 90) * 1000,
    };
    saveSpotifySession(updated);
    return updated.accessToken;
  } catch {
    return null;
  }
}

/**
 * Returns a valid Spotify access token, automatically refreshing it via refresh_token if expired or close to expiry.
 */
export async function getValidSpotifyAccessToken(): Promise<string | null> {
  const session = getStoredSpotifySession();
  if (!session) return null;

  if (Date.now() < session.expiresAt) {
    return session.accessToken;
  }

  return refreshSpotifyAccessToken(session);
}

/**
 * Wrapper around fetch for authenticated Spotify endpoints that automatically retries once on 401 by refreshing the PKCE token.
 */
async function fetchWithSpotifyAuth(url: string): Promise<Response | null> {
  const token = await getValidSpotifyAccessToken();
  if (!token) return null;

  try {
    const firstRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (firstRes.status !== 401) {
      return firstRes;
    }

    // Token expired early or was revoked -> refresh PKCE token and retry once
    const refreshedToken = await refreshSpotifyAccessToken();
    if (!refreshedToken) {
      return firstRes;
    }

    return await fetch(url, {
      headers: { Authorization: `Bearer ${refreshedToken}` },
    });
  } catch {
    return null;
  }
}

/**
 * Fetches the authenticated user's saved playlists from `https://api.spotify.com/v1/me/playlists`
 * with automatic token renewal on 401.
 */
export async function fetchUserSpotifyPlaylists(): Promise<
  SpotifyPlaylistItem[]
> {
  const res = await fetchWithSpotifyAuth(
    'https://api.spotify.com/v1/me/playlists?limit=24'
  );

  if (!res) {
    throw new Error(
      'Tu sesión de Spotify expiró o no está activa. Haz clic en "Conectar con Spotify" para renovar el acceso.'
    );
  }

  if (res.status === 401) {
    throw new Error(
      'Tu sesión de Spotify expiró. Por favor vuelve a conectar tu cuenta para importar tus playlists.'
    );
  }

  if (!res.ok) {
    throw new Error(
      `No se pudieron obtener las playlists de Spotify (código ${res.status}).`
    );
  }

  const data = await res.json().catch(() => ({}));
  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  return items
    .filter((pl) => pl && pl.name)
    .map((pl) => ({
      id: String(pl.id),
      name: String(pl.name),
      description: pl.description
        ? String(pl.description)
            .replace(/<[^>]+>/g, '')
            .trim()
        : '',
      ownerName: String(pl.owner?.display_name || pl.owner?.id || 'Spotify'),
      tracksTotal: Number(pl.tracks?.total) || 0,
      imageUrl:
        Array.isArray(pl.images) && pl.images[0]?.url
          ? String(pl.images[0].url)
          : undefined,
      spotifyUrl: String(
        pl.external_urls?.spotify ||
          `https://open.spotify.com/playlist/${pl.id}`
      ),
    }));
}

/**
 * Resolves a 30-second audio preview URL (`preview_url`) for a song or album.
 * First checks Spotify API if connected, then falls back to iTunes 30s preview stream so cards can play 30s audio reliably.
 */
export async function resolveAudioPreviewForTrack(
  title: string,
  creator?: string
): Promise<string | null> {
  const cleanTitle = title.trim();
  const cleanCreator = (creator || '')
    .replace(/Playlist.*$/i, '')
    .replace(/·.*$/, '')
    .trim();
  const searchTerm = `${cleanTitle} ${cleanCreator}`.trim();
  if (!searchTerm) return null;

  try {
    // 1. Try Spotify search for track preview_url first
    const spotifyRes = await fetchWithSpotifyAuth(
      `https://api.spotify.com/v1/search?type=track&limit=3&q=${encodeURIComponent(
        searchTerm
      )}`
    );
    if (spotifyRes && spotifyRes.ok) {
      const spData = await spotifyRes.json().catch(() => null);
      const tracks: any[] = Array.isArray(spData?.tracks?.items)
        ? spData.tracks.items
        : [];
      const withPreview = tracks.find((t) => Boolean(t?.preview_url));
      if (withPreview?.preview_url) {
        return String(withPreview.preview_url);
      }
    }
  } catch {
    // continue to fallback
  }

  try {
    // 2. Fallback to iTunes Search API for 30s m4a preview stream
    const itunesUrl = `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(
      searchTerm
    )}`;
    const itRes = await fetch(itunesUrl);
    if (itRes.ok) {
      const itData = await itRes.json().catch(() => null);
      const list: any[] = Array.isArray(itData?.results) ? itData.results : [];
      const match = list.find((r) => Boolean(r?.previewUrl));
      if (match?.previewUrl) {
        return String(match.previewUrl);
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Helper to fetch iTunes 30s previews & high-res covers in parallel so Spotify tracks/albums whose `preview_url` is null
 * still get a working 30-second audio preview and fallback search results.
 */
async function fetchItunesAudioCandidates(query: string): Promise<
  Array<{
    title: string;
    artist: string;
    album: string;
    year: string;
    imageUrl?: string;
    previewUrl?: string;
    isAlbum: boolean;
  }>
> {
  try {
    const url = `https://itunes.apple.com/search?media=music&entity=song,album&limit=8&term=${encodeURIComponent(
      query.trim()
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const list: any[] = Array.isArray(data?.results) ? data.results : [];
    return list
      .filter((r) => r.trackName || r.collectionName)
      .map((r) => {
        const isAlbum = r.wrapperType === 'collection';
        const rawArt = r.artworkUrl100 ? String(r.artworkUrl100) : undefined;
        return {
          title: String(
            isAlbum ? r.collectionName : r.trackName || r.collectionName
          ),
          artist: String(r.artistName || 'Artista'),
          album: String(r.collectionName || ''),
          year: r.releaseDate ? String(r.releaseDate).slice(0, 4) : '',
          imageUrl: rawArt
            ? rawArt
                .replace(/100x100bb/g, '600x600bb')
                .replace(/100x100/g, '600x600')
            : undefined,
          previewUrl: r.previewUrl ? String(r.previewUrl) : undefined,
          isAlbum,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Queries Spotify Official Search API (`https://api.spotify.com/v1/search?type=track,album,playlist&q=...`)
 * Uses user's PKCE access token (with automatic refresh on 401), or server proxy `/api/spotify/search`,
 * and enriches any missing `preview_url` so every song/album has a playable 30s preview and `external_urls.spotify`.
 */
export async function searchSpotifyCatalog(
  query: string,
  includePlaylists = false
): Promise<MediaSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const types = includePlaylists ? 'track,album,playlist' : 'track,album';

  try {
    const [spotifyAuthRes, itunesCandidates] = await Promise.all([
      fetchWithSpotifyAuth(
        `https://api.spotify.com/v1/search?type=${encodeURIComponent(
          types
        )}&limit=6&q=${encodeURIComponent(q)}`
      ),
      fetchItunesAudioCandidates(q),
    ]);

    let data: any = null;
    if (spotifyAuthRes && spotifyAuthRes.ok) {
      data = await spotifyAuthRes.json().catch(() => null);
    }

    if (!data) {
      try {
        const proxyRes = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(
            q
          )}&type=${encodeURIComponent(types)}`
        );
        if (proxyRes.ok) {
          const proxyJson = await proxyRes.json().catch(() => null);
          if (proxyJson?.enabled && proxyJson?.data) {
            data = proxyJson.data;
          }
        }
      } catch {
        // ignore proxy failure
      }
    }

    const findMatchingPreview = (title: string, artist: string): string | undefined => {
      const lowerTitle = title.toLowerCase();
      const lowerArtist = artist.toLowerCase();
      const exact = itunesCandidates.find(
        (c) =>
          c.previewUrl &&
          (c.title.toLowerCase() === lowerTitle ||
            c.title.toLowerCase().includes(lowerTitle)) &&
          (c.artist.toLowerCase().includes(lowerArtist) ||
            lowerArtist.includes(c.artist.toLowerCase()))
      );
      if (exact?.previewUrl) return exact.previewUrl;
      const byTitle = itunesCandidates.find(
        (c) =>
          c.previewUrl &&
          (c.title.toLowerCase() === lowerTitle ||
            c.title.toLowerCase().includes(lowerTitle) ||
            lowerTitle.includes(c.title.toLowerCase()))
      );
      return byTitle?.previewUrl || itunesCandidates.find((c) => c.previewUrl)?.previewUrl;
    };

    // If neither user OAuth token nor server Client Credentials are set yet, provide rich fallback results with 30s previews & Spotify URLs
    if (!data) {
      return itunesCandidates.slice(0, 6).map((c, idx) => ({
        id: `spotify-fallback-${idx}-${Date.now()}`,
        title: c.title,
        creator:
          !c.isAlbum && c.album && c.album !== c.title
            ? `${c.artist} · ${c.album}`
            : c.artist,
        year: c.year,
        releaseDate: c.year,
        imageUrl: c.imageUrl,
        audioPreviewUrl: c.previewUrl,
        videoUrl: `https://open.spotify.com/search/${encodeURIComponent(
          `${c.title} ${c.artist}`
        )}`,
        plot: c.isAlbum
          ? `Álbum "${c.title}" de ${c.artist} (${c.year || 'Spotify'}).`
          : `Canción "${c.title}" de ${c.artist}${
              c.album ? ` · Álbum: ${c.album}` : ''
            }.`,
        tags: ['Spotify', c.isAlbum ? 'Álbum' : 'Track', c.year].filter(
          Boolean
        ),
        mediaType: c.isAlbum ? 'album' : 'song',
        sourceLabel: 'Spotify',
      }));
    }

    const results: MediaSearchResult[] = [];

    // 1. Playlists
    if (includePlaylists && Array.isArray(data.playlists?.items)) {
      for (const pl of data.playlists.items.slice(0, 3)) {
        if (!pl || !pl.name) continue;
        const cover =
          Array.isArray(pl.images) && pl.images[0]?.url
            ? String(pl.images[0].url)
            : undefined;
        const owner = String(
          pl.owner?.display_name || pl.owner?.id || 'Spotify'
        );
        const totalTracks = Number(pl.tracks?.total) || 0;
        const spotifyUrl = String(
          pl.external_urls?.spotify ||
            `https://open.spotify.com/playlist/${pl.id}`
        );

        results.push({
          id: `spotify-playlist-${pl.id}`,
          title: String(pl.name),
          creator: `Playlist de ${owner}`,
          year: new Date().getFullYear().toString(),
          imageUrl: cover,
          videoUrl: spotifyUrl,
          plot:
            pl.description && String(pl.description).trim()
              ? String(pl.description)
                  .replace(/<[^>]+>/g, '')
                  .trim()
              : `Playlist de Spotify con ${totalTracks} canciones curadas por ${owner}.`,
          tags: ['Spotify', 'Playlist', `${totalTracks} tracks`],
          mediaType: 'album',
          sourceLabel: 'Spotify Playlist',
        });
      }
    }

    // 2. Tracks
    if (Array.isArray(data.tracks?.items)) {
      for (const tr of data.tracks.items.slice(0, 5)) {
        if (!tr || !tr.name) continue;
        const trackTitle = String(tr.name);
        const artists = Array.isArray(tr.artists)
          ? tr.artists.map((a: any) => String(a.name)).join(', ')
          : 'Artista';
        const albumName = tr.album?.name ? String(tr.album.name) : '';
        const releaseDate = tr.album?.release_date
          ? String(tr.album.release_date)
          : '';
        const year = releaseDate ? releaseDate.slice(0, 4) : '';
        const cover =
          Array.isArray(tr.album?.images) && tr.album.images[0]?.url
            ? String(tr.album.images[0].url)
            : undefined;
        const spotifyUrl = String(
          tr.external_urls?.spotify || `https://open.spotify.com/track/${tr.id}`
        );
        const previewUrl = tr.preview_url
          ? String(tr.preview_url)
          : findMatchingPreview(trackTitle, artists);

        results.push({
          id: `spotify-track-${tr.id}`,
          title: trackTitle,
          creator: albumName ? `${artists} · ${albumName}` : artists,
          year,
          releaseDate: year,
          imageUrl: cover,
          audioPreviewUrl: previewUrl,
          videoUrl: spotifyUrl,
          plot: albumName
            ? `Canción de ${artists} incluida en el álbum "${albumName}" (${
                year || 'Spotify'
              }).`
            : `Canción de ${artists} en Spotify.`,
          tags: ['Spotify', 'Track', year].filter(Boolean),
          mediaType: 'song',
          sourceLabel: 'Spotify',
        });
      }
    }

    // 3. Albums
    if (Array.isArray(data.albums?.items)) {
      for (const al of data.albums.items.slice(0, 4)) {
        if (!al || !al.name) continue;
        const albumTitle = String(al.name);
        const artists = Array.isArray(al.artists)
          ? al.artists.map((a: any) => String(a.name)).join(', ')
          : 'Artista';
        const releaseDate = al.release_date ? String(al.release_date) : '';
        const year = releaseDate ? releaseDate.slice(0, 4) : '';
        const cover =
          Array.isArray(al.images) && al.images[0]?.url
            ? String(al.images[0].url)
            : undefined;
        const spotifyUrl = String(
          al.external_urls?.spotify || `https://open.spotify.com/album/${al.id}`
        );
        const previewUrl = findMatchingPreview(albumTitle, artists);

        results.push({
          id: `spotify-album-${al.id}`,
          title: albumTitle,
          creator: artists,
          year,
          releaseDate: year,
          imageUrl: cover,
          audioPreviewUrl: previewUrl,
          videoUrl: spotifyUrl,
          plot: `Álbum de ${artists} (${year || 'Spotify'}) disponible en Spotify.`,
          tags: ['Spotify', 'Álbum', year].filter(Boolean),
          mediaType: 'album',
          sourceLabel: 'Spotify Álbum',
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
