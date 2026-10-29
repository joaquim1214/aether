import React, { useEffect, useState } from 'react';
import {
  Award,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Disc3,
  ExternalLink,
  Film,
  Flame,
  Hourglass,
  Lightbulb,
  ListTodo,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Volume2,
  Wallet,
} from 'lucide-react';
import {
  CalendarDay,
  GoogleTaskItem,
  ScheduleBlock,
  SkillItem,
  VaultFilterId,
  VaultItem,
  WishlistItem,
  WishlistPriority,
} from '../types/lifeOs';
import {
  BentoHeader,
  CalendarMatrix,
  PastelSkillCard,
  SoftBentoEmptyState,
  TimelineSchedule,
} from './BentoPrimitives';
import { VisualArtwork } from './VisualArtwork';
import {
  fetchUserSpotifyPlaylists,
  resolveAudioPreviewForTrack,
  searchSpotifyCatalog,
  SpotifyPlaylistItem,
} from '../services/spotifyService';
import {
  getAccurateHypeCountdown,
  MediaSearchResult,
} from '../services/mediaSearchService';

const SpotifyMinimalLogo: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.336.132-.67.469-.746 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.856zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
  </svg>
);

const AudioFrequencyWave: React.FC<{
  active: boolean;
  className?: string;
}> = ({ active, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 18 16"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="1.5"
      y="2"
      width="2.4"
      height="12"
      rx="1.2"
      className={active ? 'freq-bar freq-bar-1' : ''}
    />
    <rect
      x="5.7"
      y="1"
      width="2.4"
      height="14"
      rx="1.2"
      className={active ? 'freq-bar freq-bar-2' : ''}
    />
    <rect
      x="9.9"
      y="2.5"
      width="2.4"
      height="11"
      rx="1.2"
      className={active ? 'freq-bar freq-bar-3' : ''}
    />
    <rect
      x="14.1"
      y="1.5"
      width="2.4"
      height="13"
      rx="1.2"
      className={active ? 'freq-bar freq-bar-4' : ''}
    />
  </svg>
);

/* ============================================================================
   1. MÓDULO BÓVEDA DE EXPERIENCIAS (LIFE & MEDIA VAULT - 6 CATEGORÍAS)
============================================================================ */
interface VaultViewProps {
  items: VaultItem[];
  globalQuery: string;
  onOpenCreate: (defaultVaultGroup?: Exclude<VaultFilterId, 'todo'>) => void;
  onOpenAssistant: () => void;
  onPreviewItem?: (item: VaultItem) => void;
  onPreviewSearchResult?: (item: MediaSearchResult) => void;
  onEditItem?: (item: VaultItem) => void;
  onDeleteItem?: (item: VaultItem) => void;
  spotifyProfile?: { displayName: string; imageUrl?: string } | null;
  isConnectingSpotify?: boolean;
  onConnectSpotify?: () => void;
  onSaveSpotifyItemToVault?: (item: Omit<VaultItem, 'id'>) => Promise<void>;
}

const VAULT_PILL_TABS: Array<{ id: VaultFilterId; label: string }> = [
  { id: 'todo', label: 'Todo' },
  { id: 'peliculas_series', label: '🎬 Películas & Series' },
  { id: 'proximamente', label: '⏳ Próximamente (Hype Radar)' },
  { id: 'musica', label: '🎵 Música' },
  { id: 'videos', label: '▶️ Videos & Canales' },
  { id: 'personas', label: '👥 Personas' },
  { id: 'momentos', label: '✨ Momentos / Otros' },
];

export const VaultView: React.FC<VaultViewProps> = ({
  items,
  globalQuery,
  onOpenCreate,
  onOpenAssistant,
  onPreviewItem,
  onPreviewSearchResult,
  onEditItem,
  onDeleteItem,
  spotifyProfile,
  isConnectingSpotify,
  onConnectSpotify,
  onSaveSpotifyItemToVault,
}) => {
  const [activeFilter, setActiveFilter] = useState<VaultFilterId>('todo');
  const [localQuery, setLocalQuery] = useState('');

  // 30-Second Audio Preview Player state
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [audioCurrentSec, setAudioCurrentSec] = useState<number>(0);
  const [resolvedPreviews, setResolvedPreviews] = useState<
    Record<string, string>
  >({});
  const [audioUnavailableIds, setAudioUnavailableIds] = useState<
    Record<string, boolean>
  >({});
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Spotify Playlists Import & Live Search state
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<
    SpotifyPlaylistItem[]
  >([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [showPlaylistsGrid, setShowPlaylistsGrid] = useState(false);
  const [spotifyLiveResults, setSpotifyLiveResults] = useState<
    MediaSearchResult[]
  >([]);
  const [isSearchingSpotify, setIsSearchingSpotify] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // When searching in the Música filter, query Spotify API (/v1/search?type=track,album&q=...)
  useEffect(() => {
    if (activeFilter !== 'musica' || localQuery.trim().length < 2) {
      setSpotifyLiveResults([]);
      setIsSearchingSpotify(false);
      return;
    }

    let cancelled = false;
    setIsSearchingSpotify(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchSpotifyCatalog(localQuery, false);
        if (!cancelled) {
          setSpotifyLiveResults(results);
          setIsSearchingSpotify(false);
        }
      } catch {
        if (!cancelled) {
          setSpotifyLiveResults([]);
          setIsSearchingSpotify(false);
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [localQuery, activeFilter]);

  const handleLoadSpotifyPlaylists = async () => {
    setIsLoadingPlaylists(true);
    setPlaylistError(null);
    setShowPlaylistsGrid(true);
    try {
      const list = await fetchUserSpotifyPlaylists();
      setSpotifyPlaylists(list);
    } catch (err: any) {
      setSpotifyPlaylists([]);
      setPlaylistError(
        err?.message ||
          'No se pudieron cargar tus playlists de Spotify. Verifica tu conexión.'
      );
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const handleQuickSavePlaylist = async (pl: SpotifyPlaylistItem) => {
    if (!onSaveSpotifyItemToVault) return;
    const todayFormatted = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const previewUrl =
      pl.previewUrl ||
      (await resolveAudioPreviewForTrack(pl.name, pl.ownerName)) ||
      undefined;

    await onSaveSpotifyItemToVault({
      title: pl.name,
      creator: `${pl.ownerName} · Playlist Spotify`,
      category: 'Música',
      vaultGroup: 'musica',
      rating: 9.6,
      tier: 'S',
      consumedDate: todayFormatted,
      tags: ['Playlist', 'Spotify', `${pl.tracksTotal} canciones`],
      review:
        pl.description ||
        `Playlist oficial de Spotify (${pl.tracksTotal} canciones) sincronizada en mi Bóveda de Música.`,
      accent: 'mint',
      artVariant: 'synth',
      isFeaturedMasterpiece: true,
      imageUrl: pl.imageUrl,
      audioPreviewUrl: previewUrl,
      videoUrl: pl.spotifyUrl,
    });
  };

  const handleQuickSaveSpotifyTrackOrAlbum = async (sp: MediaSearchResult) => {
    if (!onSaveSpotifyItemToVault) return;
    const todayFormatted = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const previewUrl =
      sp.audioPreviewUrl ||
      (await resolveAudioPreviewForTrack(sp.title, sp.creator)) ||
      undefined;

    await onSaveSpotifyItemToVault({
      title: sp.title,
      creator: sp.creator,
      category: 'Música',
      vaultGroup: 'musica',
      rating: 9.5,
      tier: 'S',
      consumedDate: todayFormatted,
      tags:
        sp.tags && sp.tags.length > 0
          ? sp.tags.slice(0, 3)
          : [sp.mediaType === 'album' ? 'Álbum' : 'Track', 'Spotify'],
      review:
        sp.plot ||
        `${sp.mediaType === 'album' ? 'Álbum' : 'Canción'} de ${sp.creator} guardada desde Spotify.`,
      accent: 'mint',
      artVariant: 'synth',
      isFeaturedMasterpiece: true,
      imageUrl: sp.imageUrl,
      audioPreviewUrl: previewUrl,
      releaseYear: sp.year,
      videoUrl: sp.videoUrl,
    });
    setLocalQuery('');
    setSpotifyLiveResults([]);
  };

  const stopCurrentAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    setPlayingItemId(null);
    setAudioProgress(0);
    setAudioCurrentSec(0);
  };

  const handleToggleAudioPreview = async (target: {
    id: string;
    title: string;
    creator: string;
    audioPreviewUrl?: string;
  }) => {
    if (playingItemId === target.id) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();

    let previewUrl = target.audioPreviewUrl || resolvedPreviews[target.id];

    if (!previewUrl) {
      setLoadingAudioId(target.id);
      const fetched = await resolveAudioPreviewForTrack(
        target.title,
        target.creator
      );
      setLoadingAudioId(null);

      if (fetched) {
        previewUrl = fetched;
        setResolvedPreviews((prev) => ({ ...prev, [target.id]: fetched }));
      } else {
        setAudioUnavailableIds((prev) => ({ ...prev, [target.id]: true }));
        return;
      }
    }

    try {
      const nextAudio = new Audio(previewUrl);
      nextAudio.preload = 'auto';

      nextAudio.ontimeupdate = () => {
        const dur =
          nextAudio.duration && !isNaN(nextAudio.duration)
            ? nextAudio.duration
            : 30;
        const cur = nextAudio.currentTime || 0;
        setAudioCurrentSec(Math.min(30, Math.floor(cur)));
        setAudioProgress(Math.min(100, Math.round((cur / dur) * 100)));
      };

      nextAudio.onended = () => {
        stopCurrentAudio();
      };

      nextAudio.onerror = () => {
        stopCurrentAudio();
        setAudioUnavailableIds((prev) => ({ ...prev, [target.id]: true }));
      };

      audioRef.current = nextAudio;
      setPlayingItemId(target.id);
      await nextAudio.play();
    } catch {
      stopCurrentAudio();
      setAudioUnavailableIds((prev) => ({ ...prev, [target.id]: true }));
    }
  };

  const formatSeconds = (sec: number) =>
    `0:${String(Math.min(30, Math.max(0, sec))).padStart(2, '0')}`;

  const getSpotifyExternalUrl = (item: {
    title: string;
    creator: string;
    videoUrl?: string;
  }) => {
    if (item.videoUrl && item.videoUrl.trim()) {
      return item.videoUrl.trim();
    }
    return `https://open.spotify.com/search/${encodeURIComponent(
      `${item.title} ${item.creator}`
    )}`;
  };

  const effectiveSearch = (localQuery || globalQuery).toLowerCase().trim();

  // Featured Masterpieces (Tier S / 10 de 10) for the 60% Top-Left Pastel Feature Cards
  const featuredItems = items
    .filter(
      (i) =>
        i.vaultGroup !== 'proximamente' &&
        (i.isFeaturedMasterpiece || i.tier === 'S')
    )
    .slice(0, 2);

  // Upcoming Hype Radar items for the 40% Top-Right Waitlist Card
  const upcomingItems = items.filter((i) => i.vaultGroup === 'proximamente');

  // Filtered catalog items for the adaptive grid
  const filteredItems = items.filter((item) => {
    const matchesTab =
      activeFilter === 'todo' || item.vaultGroup === activeFilter;
    const matchesSearch =
      !effectiveSearch ||
      item.title.toLowerCase().includes(effectiveSearch) ||
      item.creator.toLowerCase().includes(effectiveSearch) ||
      item.tags.some((t) => t.toLowerCase().includes(effectiveSearch)) ||
      item.review.toLowerCase().includes(effectiveSearch) ||
      (item.keyTakeaway &&
        item.keyTakeaway.toLowerCase().includes(effectiveSearch));
    return matchesTab && matchesSearch;
  });

  const handleOpenModalForCurrentFilter = () => {
    if (activeFilter === 'todo') {
      onOpenCreate('peliculas_series');
    } else {
      onOpenCreate(activeFilter);
    }
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. NAVEGACIÓN INTERNA DE LA BÓVEDA (PÍLDORAS + BUSCADOR + BOTÓN CTA)
      ==================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {VAULT_PILL_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`rounded-full px-4 py-2.5 text-[0.82rem] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#141519] text-white shadow-xs'
                    : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#8E95A2] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder={
                activeFilter === 'musica'
                  ? 'Buscar en Spotify o en tu música...'
                  : 'Filtrar en tu bóveda...'
              }
              className="w-full sm:w-60 h-10 pl-9 pr-4 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] text-[0.82rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.04)]"
            />
          </div>

          <button
            type="button"
            onClick={onOpenAssistant}
            title="Dictar o pedir recomendación al Asistente IA"
            className="h-10 px-3.5 rounded-full bg-[#FFFFFF] hover:bg-[#F7F9FB] border border-[#EEF1F5] text-[#141519] text-[0.78rem] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#6CD4CE]" />
            <span>IA</span>
          </button>

          <button
            type="button"
            onClick={handleOpenModalForCurrentFilter}
            className="h-10 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar en Bóveda</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          BARRA DE SPOTIFY E IMPORTACIÓN DE PLAYLISTS (EN CATEGORÍA MÚSICA)
      ==================================================================== */}
      {activeFilter === 'musica' && (
        <div className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[14px] bg-[#1DB954]/15 text-[#1DB954] flex items-center justify-center shrink-0">
                <SpotifyMinimalLogo className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[0.95rem] font-bold text-[#141519]">
                    Spotify Music Sync
                  </h3>
                  {spotifyProfile && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.68rem] font-bold">
                      ● {spotifyProfile.displayName}
                    </span>
                  )}
                </div>
                <p className="text-[0.75rem] font-medium text-[#6E7480]">
                  {spotifyProfile
                    ? 'Importa tus playlists o busca canciones y álbumes en Spotify.'
                    : 'Vincula tu cuenta para importar playlists y catálogo.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {spotifyProfile ? (
                <button
                  type="button"
                  onClick={handleLoadSpotifyPlaylists}
                  disabled={isLoadingPlaylists}
                  className="h-9 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.78rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#1DB954] ${
                      isLoadingPlaylists ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {isLoadingPlaylists
                      ? 'Cargando...'
                      : 'Importar Playlists'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnectSpotify}
                  disabled={isConnectingSpotify}
                  className="h-9 px-4 rounded-full bg-[#1DB954] hover:bg-[#1aa34a] text-[#141519] keep-dark-text text-[0.78rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
                >
                  <SpotifyMinimalLogo className="w-4 h-4" />
                  <span>
                    {isConnectingSpotify
                      ? 'Conectando...'
                      : 'Conectar con Spotify'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Resultados en vivo de Spotify API al escribir en el buscador de Música */}
          {localQuery.trim().length >= 2 && (
            <div className="pt-3 border-t border-[#EEF1F5]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[0.74rem] font-bold text-[#6E7480] flex items-center gap-1.5">
                  <SpotifyMinimalLogo className="w-3.5 h-3.5 text-[#1DB954]" />
                  <span>
                    Catálogo de Spotify para “{localQuery.trim()}”
                  </span>
                </span>
                {isSearchingSpotify && (
                  <span className="text-[0.7rem] text-[#8E95A2]">
                    Buscando en Spotify...
                  </span>
                )}
              </div>

              {!isSearchingSpotify && spotifyLiveResults.length === 0 ? (
                <div className="p-3.5 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] text-[0.76rem] font-medium text-[#6E7480]">
                  No se encontraron resultados en Spotify para esta búsqueda.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {spotifyLiveResults.slice(0, 4).map((sp) => {
                    const isPlayingSp = playingItemId === sp.id;
                    return (
                      <div
                        key={sp.id}
                        onClick={() => onPreviewSearchResult?.(sp)}
                        className="p-3 rounded-[18px] bg-[#F7F9FB] hover:bg-[#EBF0F5]/60 border border-[#EEF1F5] flex flex-col justify-between gap-2.5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-11 h-11 rounded-[12px] bg-[#EBF0F5] overflow-hidden shrink-0 border border-white">
                            {sp.imageUrl ? (
                              <img
                                src={sp.imageUrl}
                                alt={sp.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Disc3 className="w-5 h-5 text-[#6E7480] m-3" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[0.8rem] font-bold text-[#141519] truncate">
                              {sp.title}
                            </p>
                            <p className="text-[0.7rem] font-medium text-[#6E7480] truncate">
                              {sp.creator}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#EEF1F5]">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAudioPreview({
                                  id: sp.id,
                                  title: sp.title,
                                  creator: sp.creator,
                                  audioPreviewUrl: sp.audioPreviewUrl,
                                });
                              }}
                              title="Escuchar vista previa de 30s"
                              className={`h-7 px-2.5 rounded-full border text-[0.68rem] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isPlayingSp
                                  ? 'bg-[#141519] border-[#141519] text-white'
                                  : 'bg-[#FFFFFF] hover:bg-[#EBF0F5] border-[#EEF1F5] text-[#141519]'
                              }`}
                            >
                              {isPlayingSp ? (
                                <>
                                  <Pause className="w-2.5 h-2.5 fill-current text-[#6CD4CE]" />
                                  <AudioFrequencyWave
                                    active={isPlayingSp}
                                    className="w-3.5 h-3 text-[#6CD4CE]"
                                  />
                                  <span>Pausa</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 fill-[#141519]" />
                                  <span>30s</span>
                                </>
                              )}
                            </button>

                            {sp.videoUrl && (
                              <a
                                href={sp.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Abrir en Spotify"
                                className="h-7 px-2.5 rounded-full bg-[#1DB954]/15 hover:bg-[#1DB954]/30 text-[#141519] text-[0.68rem] font-bold flex items-center gap-1"
                              >
                                <SpotifyMinimalLogo className="w-3 h-3 text-[#1DB954]" />
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickSaveSpotifyTrackOrAlbum(sp);
                            }}
                            title="Guardar en Bóveda de Música"
                            className="h-7 px-3 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.68rem] font-semibold shrink-0 cursor-pointer"
                          >
                            + Guardar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Cuadrícula limpia de Playlists guardadas en Spotify (/v1/me/playlists) */}
          {showPlaylistsGrid && (
            <div className="pt-3 border-t border-[#EEF1F5]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[0.78rem] font-bold text-[#141519]">
                  Tus Playlists de Spotify ({spotifyPlaylists.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowPlaylistsGrid(false)}
                  className="text-[0.72rem] font-semibold text-[#6E7480] hover:text-[#141519] cursor-pointer"
                >
                  Ocultar
                </button>
              </div>

              {playlistError ? (
                <div className="p-4 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-[0.78rem] font-medium text-[#6E7480]">
                    {playlistError}
                  </p>
                  <button
                    type="button"
                    onClick={onConnectSpotify}
                    className="h-8 px-3.5 rounded-full bg-[#1DB954] text-[#141519] keep-dark-text text-[0.74rem] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <SpotifyMinimalLogo className="w-3.5 h-3.5" />
                    <span>Reconectar Spotify</span>
                  </button>
                </div>
              ) : spotifyPlaylists.length === 0 && !isLoadingPlaylists ? (
                <p className="text-[0.78rem] text-[#6E7480] py-2">
                  No se encontraron playlists públicas o privadas en tu cuenta.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {spotifyPlaylists.map((pl) => (
                    <div
                      key={pl.id}
                      className="p-3.5 rounded-[20px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-between gap-3 hover:bg-[#EBF0F5]/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-13 h-13 rounded-[14px] bg-[#EBF0F5] overflow-hidden shrink-0 border border-white shadow-2xs">
                          {pl.imageUrl ? (
                            <img
                              src={pl.imageUrl}
                              alt={pl.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Disc3 className="w-5 h-5 text-[#6E7480] m-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-[0.84rem] font-bold text-[#141519] truncate">
                            {pl.name}
                          </h4>
                          <p className="text-[0.71rem] font-medium text-[#6E7480] truncate">
                            {pl.ownerName} · {pl.tracksTotal} canciones
                          </p>
                          <a
                            href={pl.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-[#1DB954] hover:underline mt-0.5"
                          >
                            <span>Abrir en Spotify</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleQuickSavePlaylist(pl)}
                        className="h-8 px-3 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.72rem] font-semibold shrink-0 cursor-pointer"
                      >
                        Importar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          2. SECCIÓN SUPERIOR BENTO: DESTACADOS DEL MES (60%) + PRÓXIMAMENTE (40%)
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* IZQUIERDA (60% -> 7 cols): Destacados del Mes (pastelFeatureCard) */}
        <div className="lg:col-span-7 bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519]">
                  <Star className="w-4 h-4 fill-[#141519]" />
                </div>
                <div>
                  <h2 className="text-[1.05rem] font-bold tracking-[-0.01em] text-[#141519]">
                    Destacados del Mes · Obras Maestras
                  </h2>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold tracking-[0.01em]">
                Tier S · Favoritos
              </span>
            </div>

            {featuredItems.length === 0 ? (
              <SoftBentoEmptyState
                icon={<Star className="w-5 h-5" />}
                title="Aún no tienes Obras Maestras (Tier S)"
                description="Cuando califiques una película, serie, álbum o experiencia con 9.0 o más, aparecerá destacada aquí con diseño pastel."
                actionLabel="+ Registrar Obra Favorita"
                onAction={() => onOpenCreate('peliculas_series')}
                onAskAssistant={onOpenAssistant}
                compact
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {featuredItems.map((fav, idx) => {
                  const gradientClass =
                    idx % 2 === 0 ? 'bg-mint-gradient' : 'bg-lavender-gradient';
                  const pct = Math.min(100, Math.round(fav.rating * 10));

                  return (
                    <div
                      key={fav.id}
                      onClick={() => onPreviewItem?.(fav)}
                      className={`${gradientClass} inner-card-stroke rounded-[20px] p-5 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="w-[44px] h-[44px] rounded-[14px] bg-white text-[#141519] keep-dark-text flex items-center justify-center shadow-xs shrink-0 overflow-hidden border border-white/60">
                          {fav.imageUrl ? (
                            <img
                              src={fav.imageUrl}
                              alt={fav.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Film className="w-5 h-5" />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {fav.vaultGroup === 'musica' && (
                            <a
                              href={getSpotifyExternalUrl(fav)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Abrir en Spotify"
                              className="px-2.5 py-1 rounded-full bg-[#1DB954] text-[#141519] keep-dark-text text-[0.68rem] font-extrabold flex items-center gap-1 shadow-2xs"
                            >
                              <SpotifyMinimalLogo className="w-3 h-3" />
                              <span>Spotify</span>
                            </a>
                          )}
                          {fav.imdbRating && (
                            <a
                              href={
                                fav.imdbId
                                  ? `https://www.imdb.com/title/${fav.imdbId}`
                                  : undefined
                              }
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={
                                fav.imdbId
                                  ? `Ver ${fav.imdbId} en IMDb (${fav.imdbVotes || 'Oficial'})`
                                  : 'Calificación oficial de IMDb'
                              }
                              className="px-2.5 py-1 rounded-full bg-[#F5C518] text-[#141519] keep-dark-text text-[0.68rem] font-extrabold tabular-nums shadow-2xs"
                            >
                              IMDb {fav.imdbRating} ★
                            </a>
                          )}
                          <span className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold tabular-nums">
                            {fav.rating.toFixed(1)} ★ · Tier {fav.tier}
                          </span>
                          {onEditItem && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditItem(fav);
                              }}
                              title="Editar registro"
                              aria-label="Editar registro"
                              className="w-8 h-8 rounded-full bg-white/60 hover:bg-white text-[#141519] keep-dark-text flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveFilter(fav.vaultGroup);
                            }}
                            className="w-8 h-8 rounded-full bg-white/60 hover:bg-white text-[#141519] keep-dark-text flex items-center justify-center cursor-pointer"
                            aria-label="Filtrar categoría"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mb-4">
                        <span className="block text-[0.72rem] font-semibold text-[#141519]/75 keep-dark-text mb-0.5">
                          {fav.category} · {fav.creator}
                          {fav.releaseYear ? ` (${fav.releaseYear})` : ''}
                        </span>
                        <h3 className="text-[1.125rem] font-bold text-[#141519] keep-dark-text leading-snug mb-1.5">
                          {fav.title}
                        </h3>
                        {fav.actors && (
                          <p className="text-[0.7rem] font-semibold text-[#141519]/75 keep-dark-text truncate mb-2">
                            👥 Reparto: {fav.actors}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          {fav.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.35)',
                              }}
                              className="px-2.5 py-1 rounded-full text-[0.7rem] font-semibold text-[#141519] keep-dark-text border border-white/50 backdrop-blur-[2px] whitespace-nowrap"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <p className="text-[0.76rem] font-medium text-[#141519]/85 keep-dark-text line-clamp-2 leading-relaxed">
                          “{fav.review}”
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[0.73rem] font-bold text-[#141519] keep-dark-text mb-1.5">
                          <span>Impacto Personal</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <div
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.35)',
                          }}
                          className="w-full h-2.5 rounded-full overflow-hidden p-0.5 border border-white/40"
                        >
                          <div
                            className="h-full bg-[#FFFFFF] keep-white rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* DERECHA (40% -> 5 cols): ⏳ Próximamente (En Espera / Hype Radar) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519]">
                  <Hourglass className="w-4 h-4" />
                </div>
                <h2 className="text-[1.05rem] font-bold tracking-[-0.01em] text-[#141519]">
                  ⏳ Próximamente (En Espera)
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onOpenCreate('proximamente')}
                title="Añadir estreno al Hype Radar"
                className="h-8 px-3 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.74rem] font-semibold text-[#141519] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Estreno</span>
              </button>
            </div>

            {upcomingItems.length === 0 ? (
              <SoftBentoEmptyState
                icon={<Hourglass className="w-5 h-5" />}
                title="Radar de Próximos Estrenos vacío"
                description="Registra las películas, series o nuevas temporadas que estás esperando ver."
                actionLabel="+ Añadir Estreno"
                onAction={() => onOpenCreate('proximamente')}
                compact
              />
            ) : (
              <>
                <div className="space-y-3">
                  {upcomingItems.map((up, idx) => {
                    const isLavenderBadge = idx % 2 === 1;
                    const countdownInfo = getAccurateHypeCountdown(
                      up.releaseDate,
                      up.daysRemaining
                    );
                    const hype = Math.min(
                      100,
                      Math.max(0, Number(up.hypeLevel ?? 95))
                    );

                    return (
                      <div
                        key={up.id}
                        onClick={() =>
                          onPreviewItem
                            ? onPreviewItem(up)
                            : setActiveFilter('proximamente')
                        }
                        className="p-3.5 rounded-[20px] bg-[#F7F9FB] hover:bg-[#EBF0F5]/60 border border-[#EEF1F5] flex flex-col gap-2.5 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-14 rounded-[12px] overflow-hidden shrink-0 border border-[#EEF1F5] bg-[#FFFFFF]">
                              <VisualArtwork
                                variant={up.artVariant}
                                accent={up.accent}
                                imageUrl={up.imageUrl}
                                alt={up.title}
                              />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-[0.86rem] font-bold text-[#141519] truncate">
                                {up.title}
                              </h3>
                              <p className="text-[0.72rem] font-medium text-[#6E7480] truncate mt-0.5">
                                {up.releaseFormat || up.creator} · Estreno:{' '}
                                <strong className="text-[#141519]">
                                  {countdownInfo.formattedDate}
                                </strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[0.7rem] font-bold tabular-nums whitespace-nowrap ${
                                isLavenderBadge
                                  ? 'bg-[#BBC6F8] text-[#141519] keep-dark-text'
                                  : 'bg-[#141519] text-white'
                              }`}
                            >
                              {countdownInfo.isFuture
                                ? `Faltan ${countdownInfo.daysRemaining} días`
                                : 'Ya estrenada'}
                            </span>
                            {onEditItem && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditItem(up);
                                }}
                                title="Editar estreno"
                                aria-label="Editar estreno"
                                className="w-7 h-7 rounded-full bg-[#FFFFFF] hover:bg-[#141519] text-[#6E7480] hover:text-white border border-[#EEF1F5] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Barra de Nivel de Hype (0-100%) */}
                        <div>
                          <div className="flex items-center justify-between text-[0.68rem] font-bold text-[#6E7480] mb-1 tabular-nums">
                            <span>Nivel de Hype</span>
                            <span className="text-[#141519]">{hype}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-striped-pattern border border-[#EEF1F5] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-lavender-gradient transition-all duration-300"
                              style={{ width: `${hype}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 pt-3.5 border-t border-[#EEF1F5] flex items-center justify-end text-[0.73rem] font-semibold text-[#6E7480]">
            <button
              type="button"
              onClick={() => setActiveFilter('proximamente')}
              className="text-[#141519] hover:underline cursor-pointer"
            >
              Ver Radar ({upcomingItems.length}) →
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. GRID ADAPTABLE SEGÚN EL TIPO DE EXPERIENCIA
      ==================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[1.1rem] font-bold text-[#141519]">
              {VAULT_PILL_TABS.find((t) => t.id === activeFilter)?.label ||
                'Catálogo de la Bóveda'}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold tabular-nums">
              {filteredItems.length} ítems
            </span>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento">
            <SoftBentoEmptyState
              icon={<Film className="w-5 h-5" />}
              title="Tu Bóveda está lista para tu primera experiencia"
              description="Registra tus películas, series, estrenos en espera, música, videos, personas importantes o momentos especiales en Firebase."
              actionLabel="+ Agregar primer registro"
              onAction={handleOpenModalForCurrentFilter}
              onAskAssistant={onOpenAssistant}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item) => {
              const renderEditBtn = () =>
                onEditItem ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditItem(item);
                    }}
                    title="Editar registro de la Bóveda"
                    aria-label="Editar registro"
                    className="w-7 h-7 rounded-full bg-[#F7F9FB] hover:bg-[#141519] text-[#6E7480] hover:text-white border border-[#EEF1F5] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                ) : null;

              const renderDeleteBtn = () =>
                onDeleteItem ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item);
                    }}
                    title="Eliminar registro de la Bóveda"
                    aria-label="Eliminar registro"
                    className="w-7 h-7 rounded-full bg-[#F7F9FB] hover:bg-[#F28B82] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : null;

              /* ----------------------------------------------------------------
                 VARIANTE A: 🎵 MÚSICA (Diseño Estilo Vinilo + Reproductor 30s + Abrir en Spotify)
              ---------------------------------------------------------------- */
              if (item.vaultGroup === 'musica') {
                const isPlayingThis = playingItemId === item.id;
                const isLoadingThis = loadingAudioId === item.id;
                const isUnavailable = Boolean(audioUnavailableIds[item.id]);
                const spotifyHref = getSpotifyExternalUrl(item);

                return (
                  <div
                    key={item.id}
                    onClick={() => onPreviewItem?.(item)}
                    className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="relative w-24 h-20 shrink-0 flex items-center">
                          <div className="absolute right-0 w-18 h-18 rounded-full bg-[#141519] border-2 border-[#2A2C34] shadow-md flex items-center justify-center">
                            <div
                              className={`w-12 h-12 rounded-full border border-white/15 flex items-center justify-center ${
                                isPlayingThis ? 'animate-spin' : ''
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full ${
                                  item.accent === 'mint'
                                    ? 'bg-[#A8E6E3]'
                                    : 'bg-[#BBC6F8]'
                                } flex items-center justify-center`}
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-[#141519]" />
                              </div>
                            </div>
                          </div>
                          <div className="relative z-10 w-18 h-18 rounded-[16px] overflow-hidden border-2 border-white shadow-sm">
                            <VisualArtwork
                              variant="synth"
                              accent={item.accent}
                              imageUrl={item.imageUrl}
                              alt={item.title}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[0.7rem] font-bold text-[#6CD4CE] uppercase tracking-wider flex items-center gap-1">
                              <Disc3
                                className={`w-3.5 h-3.5 text-[#141519] ${
                                  isPlayingThis ? 'animate-spin' : ''
                                }`}
                              />
                              <span className="text-[#6E7480]">
                                {item.releaseYear
                                  ? `Álbum · ${item.releaseYear}`
                                  : 'Álbum / Track'}
                              </span>
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold tabular-nums">
                                {item.rating.toFixed(1)} ★
                              </span>
                              {renderEditBtn()}
                              {renderDeleteBtn()}
                            </div>
                          </div>
                          <h4 className="text-[1.02rem] font-bold text-[#141519] leading-snug truncate">
                            {item.title}
                          </h4>
                          <p className="text-[0.8rem] font-semibold text-[#6E7480] truncate">
                            {item.creator}
                          </p>
                        </div>
                      </div>

                      {/* 1. REPRODUCTOR INTEGRADO DE VISTA PREVIA (30 SEGUNDOS) */}
                      <div className="mb-3.5 p-3 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5]">
                        {isUnavailable ? (
                          <div className="flex items-center justify-between gap-2 text-[0.73rem] font-medium text-[#8E95A2]">
                            <span>
                              No hay vista previa disponible para este contenido
                            </span>
                            <a
                              href={spotifyHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#141519] font-bold hover:underline shrink-0"
                            >
                              Escuchar en Spotify ↗
                            </a>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAudioPreview(item);
                              }}
                              disabled={isLoadingThis}
                              aria-label={
                                isPlayingThis
                                  ? 'Pausar vista previa'
                                  : 'Reproducir vista previa de 30 segundos'
                              }
                              className={`h-9 rounded-full flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-2xs ${
                                isPlayingThis
                                  ? 'px-3 bg-[#1DB954] text-[#141519] keep-dark-text'
                                  : 'w-9 bg-[#141519] hover:bg-[#2A2C34] text-white'
                              }`}
                            >
                              {isLoadingThis ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : isPlayingThis ? (
                                <>
                                  <Pause className="w-3 h-3 fill-current shrink-0" />
                                  <AudioFrequencyWave
                                    active={isPlayingThis}
                                    className="w-4 h-3.5 shrink-0"
                                  />
                                </>
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-[0.7rem] font-semibold mb-1">
                                <span className="text-[#141519] flex items-center gap-1.5 truncate">
                                  <Volume2 className="w-3 h-3 text-[#6E7480] shrink-0" />
                                  <span>
                                    {isPlayingThis
                                      ? 'Reproduciendo fragmento...'
                                      : 'Vista previa · 30s'}
                                  </span>
                                </span>
                                <span className="text-[#6E7480] tabular-nums shrink-0">
                                  {isPlayingThis
                                    ? `${formatSeconds(audioCurrentSec)} / 0:30`
                                    : '0:30'}
                                </span>
                              </div>

                              {/* Indicador visual sutil de onda y barra de progreso */}
                              <div className="w-full h-1.5 rounded-full bg-[#EBF0F5] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#141519] transition-all duration-150"
                                  style={{
                                    width: `${isPlayingThis ? Math.max(6, audioProgress) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. BOTÓN "ABRIR EN SPOTIFY" + TAGS DE VIBRA */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
                        <a
                          href={spotifyHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1 rounded-full bg-[#1DB954] hover:bg-[#1aa34a] text-[#141519] keep-dark-text text-[0.7rem] font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <SpotifyMinimalLogo className="w-3.5 h-3.5" />
                          <span>Abrir en Spotify</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>

                        {item.tags.map((vibe) => (
                          <span
                            key={vibe}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold keep-dark-text ${
                              item.accent === 'mint'
                                ? 'bg-[#A8E6E3]/65 text-[#141519]'
                                : 'bg-[#BBC6F8]/65 text-[#141519]'
                            }`}
                          >
                            {vibe}
                          </span>
                        ))}
                      </div>

                      <p className="text-[0.8rem] text-[#141519]/85 bg-[#F7F9FB] rounded-[16px] p-3.5 border border-[#EEF1F5] leading-relaxed">
                        “{item.review}”
                      </p>
                    </div>
                  </div>
                );
              }

              /* ----------------------------------------------------------------
                 VARIANTE B: ▶️ VIDEOS & CANALES (Miniatura 16:9 + Idea Clave)
              ---------------------------------------------------------------- */
              if (item.vaultGroup === 'videos') {
                return (
                  <div
                    key={item.id}
                    onClick={() => onPreviewItem?.(item)}
                    className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div>
                      <div className="relative w-full aspect-video rounded-[18px] overflow-hidden mb-4 border border-[#EEF1F5] group">
                        <VisualArtwork
                          variant={item.artVariant}
                          accent={item.accent}
                          imageUrl={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full"
                        />
                        <div className="absolute inset-0 bg-[#141519]/15 flex items-center justify-center">
                          <div className="w-11 h-11 rounded-full bg-[#141519] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-[#141519]/90 text-white text-[0.7rem] font-bold tabular-nums">
                          {item.duration || '24:10'}
                        </span>
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-white/90 text-[#141519] keep-dark-text text-[0.68rem] font-bold">
                          ▶️ Video / Ensayo
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[0.74rem] font-semibold text-[#6E7480] mb-1">
                        <span className="truncate">{item.creator}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[#141519] font-bold tabular-nums">
                            {item.rating.toFixed(1)} ★
                          </span>
                          {renderEditBtn()}
                          {renderDeleteBtn()}
                        </div>
                      </div>

                      <h4 className="text-[1.02rem] font-bold text-[#141519] leading-snug mb-3">
                        {item.title}
                      </h4>

                      <div
                        className={`rounded-[16px] p-3.5 mb-3 ${
                          item.accent === 'mint'
                            ? 'bg-mint-gradient'
                            : 'bg-lavender-gradient'
                        } inner-card-stroke`}
                      >
                        <div className="flex items-center gap-1.5 text-[0.7rem] font-bold text-[#141519] keep-dark-text mb-1">
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>Idea clave que aprendí:</span>
                        </div>
                        <p className="text-[0.78rem] font-medium text-[#141519] keep-dark-text leading-relaxed">
                          {item.keyTakeaway || item.review}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#EEF1F5] flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] font-semibold text-[#6E7480]">
                        {item.tags.slice(0, 2).map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                      </div>
                      <a
                        href={item.videoUrl || 'https://youtube.com'}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1 rounded-full bg-[#F7F9FB] hover:bg-[#141519] hover:text-white text-[#141519] text-[0.72rem] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <span>Ver video</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              }

              /* ----------------------------------------------------------------
                 VARIANTE C: 👥 PERSONAS (Avatar Circular + Vínculo + Notas Clave)
              ---------------------------------------------------------------- */
              if (item.vaultGroup === 'personas') {
                return (
                  <div
                    key={item.id}
                    onClick={() => onPreviewItem?.(item)}
                    className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-14 h-14 rounded-full border-2 border-[#141519] flex items-center justify-center font-bold text-[1rem] shrink-0 keep-dark-text overflow-hidden ${
                              item.accent === 'mint'
                                ? 'bg-mint-gradient text-[#141519]'
                                : 'bg-lavender-gradient text-[#141519]'
                            }`}
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              item.personInitials ||
                              item.title
                                .split(' ')
                                .map((w) => w[0])
                                .join('')
                                .slice(0, 2)
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-[1.05rem] font-bold text-[#141519] truncate">
                              {item.title}
                            </h4>
                            <p className="text-[0.76rem] font-medium text-[#6E7480] truncate">
                              {item.creator}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-3 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold">
                            {item.relationshipTag || 'Vínculo'}
                          </span>
                          {renderEditBtn()}
                          {renderDeleteBtn()}
                        </div>
                      </div>

                      {item.personMeta && (
                        <div className="px-3.5 py-2 rounded-[14px] bg-[#F7F9FB] border border-[#EEF1F5] text-[0.74rem] font-semibold text-[#141519] mb-3">
                          ✨ {item.personMeta}
                        </div>
                      )}

                      <div className="bg-[#F7F9FB] rounded-[16px] p-3.5 border border-[#EEF1F5] mb-4">
                        <p className="text-[0.8rem] text-[#141519]/90 leading-relaxed">
                          {item.review}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.7rem] font-semibold text-[#141519]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }

              /* ----------------------------------------------------------------
                 VARIANTE D: ⏳ PRÓXIMAMENTE (Hype Radar Card Completa)
              ---------------------------------------------------------------- */
              if (item.vaultGroup === 'proximamente') {
                const hype = Math.min(
                  100,
                  Math.max(0, Number(item.hypeLevel ?? 95))
                );
                const countdownInfo = getAccurateHypeCountdown(
                  item.releaseDate,
                  item.daysRemaining
                );
                return (
                  <div
                    key={item.id}
                    onClick={() => onPreviewItem?.(item)}
                    className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-14 h-20 rounded-[16px] overflow-hidden shrink-0 border border-[#EEF1F5] bg-[#F7F9FB]">
                            <VisualArtwork
                              variant={item.artVariant}
                              accent={item.accent}
                              imageUrl={item.imageUrl}
                              alt={item.title}
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.68rem] font-bold mb-1">
                              {item.releaseFormat || 'Próximo Estreno'}
                            </span>
                            <h4 className="text-[1.04rem] font-bold text-[#141519] leading-snug">
                              {item.title}
                            </h4>
                            <p className="text-[0.76rem] font-medium text-[#6E7480]">
                              {item.creator}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.imdbRating && (
                            <span className="px-2.5 py-1 rounded-full bg-[#F5C518] text-[#141519] keep-dark-text text-[0.68rem] font-extrabold tabular-nums whitespace-nowrap">
                              IMDb {item.imdbRating} ★
                            </span>
                          )}
                          <span className="px-3 py-1 rounded-full bg-[#141519] text-white text-[0.72rem] font-bold tabular-nums whitespace-nowrap">
                            {countdownInfo.isFuture
                              ? `Faltan ${countdownInfo.daysRemaining} días`
                              : 'Ya estrenada'}
                          </span>
                          {renderEditBtn()}
                          {renderDeleteBtn()}
                        </div>
                      </div>

                      {item.actors && (
                        <p className="text-[0.72rem] font-semibold text-[#6E7480] mb-2 truncate">
                          👥 Reparto: {item.actors}
                        </p>
                      )}

                      <p className="text-[0.8rem] text-[#141519]/85 bg-[#F7F9FB] rounded-[16px] p-3.5 border border-[#EEF1F5] mb-4 leading-relaxed">
                        “{item.review}”
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[0.74rem] font-bold text-[#141519] mb-1.5 tabular-nums">
                        <span>Estreno: {countdownInfo.formattedDate}</span>
                        <span>Hype: {hype}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-striped-pattern border border-[#EEF1F5] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-lavender-gradient transition-all duration-300"
                          style={{ width: `${hype}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              /* ----------------------------------------------------------------
                 VARIANTE E: 🎬 PELÍCULAS & SERIES y ✨ MOMENTOS / OTROS
              ---------------------------------------------------------------- */
              return (
                <div
                  key={item.id}
                  onClick={() => onPreviewItem?.(item)}
                  className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
                >
                  <div>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-20 h-24 rounded-[18px] overflow-hidden shrink-0 border border-[#EEF1F5]">
                        <VisualArtwork
                          variant={item.artVariant}
                          accent={item.accent}
                          imageUrl={item.imageUrl}
                          alt={item.title}
                        />
                      </div>

                       <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[0.72rem] font-semibold text-[#8E95A2] truncate">
                            {item.category}
                            {item.releaseYear
                              ? ` (${item.releaseYear})`
                              : ` · ${item.consumedDate}`}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                            {item.imdbRating && (
                              <a
                                href={
                                  item.imdbId
                                    ? `https://www.imdb.com/title/${item.imdbId}`
                                    : undefined
                                }
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={
                                  item.imdbId
                                    ? `IMDb Oficial (${item.imdbId}) · ${item.imdbVotes || ''}`
                                    : 'Calificación oficial de IMDb'
                                }
                                className="px-2 py-0.5 rounded-full bg-[#F5C518] text-[#141519] keep-dark-text text-[0.68rem] font-extrabold tabular-nums flex items-center gap-0.5 shadow-2xs"
                              >
                                <span>IMDb {item.imdbRating} ★</span>
                              </a>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold keep-dark-text ${
                                item.tier === 'S'
                                  ? 'bg-[#A8E6E3] text-[#141519]'
                                  : 'bg-[#BBC6F8] text-[#141519]'
                              }`}
                            >
                              Tier {item.tier}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.72rem] font-bold tabular-nums flex items-center gap-1">
                              {item.rating.toFixed(1)} ★
                            </span>
                            {renderEditBtn()}
                            {renderDeleteBtn()}
                          </div>
                        </div>

                        <h4 className="text-[1.06rem] font-bold text-[#141519] leading-snug mb-0.5">
                          {item.title}
                        </h4>
                        <p className="text-[0.78rem] font-medium text-[#6E7480] truncate">
                          {item.location ? `📍 ${item.location}` : item.creator}
                        </p>
                        {item.actors && (
                          <p className="text-[0.71rem] font-semibold text-[#6E7480] truncate mt-1">
                            👥 {item.actors}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-[0.82rem] text-[#141519]/85 leading-relaxed bg-[#F7F9FB] rounded-[16px] p-3.5 border border-[#EEF1F5] mb-4">
                      “{item.review}”
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.7rem] font-semibold text-[#141519]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   2. MÓDULO PROYECTO DE VIDA, APRENDIZAJES Y METAS FÍSICAS (RPG SKILL TREE)
============================================================================ */
type SkillBranchFilter = 'all' | 'learning' | 'sports';

interface SkillsViewProps {
  skills: SkillItem[];
  onAddHour: (skillId: string, hours?: number) => void;
  onToggleMilestone: (skillId: string, milestoneId: string) => void;
  onAddMilestone?: (skillId: string, title: string, badge?: string) => void;
  onDeleteSkill?: (skill: SkillItem) => void;
  onOpenCreate: () => void;
  onAskAssistant?: () => void;
}

const SKILL_BRANCH_PILLS: Array<{ id: SkillBranchFilter; label: string }> = [
  { id: 'all', label: 'Todas las Ramas' },
  { id: 'learning', label: '🧠 Aprendizajes & Skills' },
  { id: 'sports', label: '🏀⚽ Metas Físicas & Deporte' },
];

export const SkillsView: React.FC<SkillsViewProps> = ({
  skills,
  onAddHour,
  onToggleMilestone,
  onAddMilestone,
  onDeleteSkill,
  onOpenCreate,
  onAskAssistant,
}) => {
  const [branchFilter, setBranchFilter] = useState<SkillBranchFilter>('all');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('all');
  const [newRecordTitle, setNewRecordTitle] = useState('');
  const [targetRecordSkillId, setTargetRecordSkillId] = useState<string>(
    skills[0]?.id || ''
  );

  useEffect(() => {
    if (skills.length > 0 && !skills.some((s) => s.id === targetRecordSkillId)) {
      setTargetRecordSkillId(skills[0].id);
    }
  }, [skills, targetRecordSkillId]);

  const filteredSkills = skills.filter((s) => {
    if (branchFilter === 'all') return true;
    const itemBranch = s.branch || 'learning';
    return itemBranch === branchFilter;
  });

  const totalHours = skills
    .filter((s) => (s.branch || 'learning') === 'learning')
    .reduce((acc, s) => acc + s.hoursInvested, 0);
  const totalTrainings = skills
    .filter((s) => s.branch === 'sports')
    .reduce((acc, s) => acc + s.hoursInvested, 0);
  const totalLevels = skills.reduce((acc, s) => acc + s.level, 0);
  const unlockedMilestones = skills.reduce(
    (acc, s) => acc + s.milestones.filter((m) => m.unlocked).length,
    0
  );

  const allMilestoneEntries = filteredSkills
    .filter((s) => selectedSkillId === 'all' || s.id === selectedSkillId)
    .flatMap((skill) =>
      skill.milestones.map((m) => ({
        skillId: skill.id,
        skillName: skill.name,
        skillAccent: skill.accent,
        skillBranch: skill.branch || 'learning',
        milestone: m,
      }))
    );

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecordTitle.trim() || !onAddMilestone || skills.length === 0) return;
    const targetSkill =
      skills.find((s) => s.id === targetRecordSkillId) || skills[0];
    const lowerName = targetSkill.name.toLowerCase();
    const autoBadge =
      lowerName.includes('básquet') || lowerName.includes('basquet')
        ? '🏀 Básquet'
        : lowerName.includes('fútbol') || lowerName.includes('futbol')
        ? '⚽ Fútbol'
        : targetSkill.branch === 'sports'
        ? '⚡ Físico'
        : '🧠 Skill';
    onAddMilestone(targetSkill.id, newRecordTitle.trim(), autoBadge);
    setNewRecordTitle('');
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. BARRA SUPERIOR DE FILTROS EN PÍLDORAS (RAMAS RPG) + CONTROLES
      ==================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {SKILL_BRANCH_PILLS.map((pill) => {
            const isActive = branchFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setBranchFilter(pill.id);
                  setSelectedSkillId('all');
                }}
                className={`rounded-full px-4 py-2.5 text-[0.83rem] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#141519] text-white shadow-xs'
                    : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3.5 py-2 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] flex items-center gap-2 text-[0.78rem] font-semibold text-[#141519] tabular-nums shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[#6CD4CE]" />
            <span>{totalHours}h Estudio</span>
          </div>
          <div className="px-3.5 py-2 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] flex items-center gap-2 text-[0.78rem] font-semibold text-[#141519] tabular-nums shadow-2xs">
            <Flame className="w-3.5 h-3.5 text-[#9BA9F0]" />
            <span>{totalTrainings} Entrenamientos</span>
          </div>
          <div className="px-3.5 py-2 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] flex items-center gap-2 text-[0.78rem] font-semibold text-[#141519] tabular-nums shadow-2xs">
            <Award className="w-3.5 h-3.5 text-[#141519]" />
            <span>Lv. {totalLevels} · {unlockedMilestones} Récords</span>
          </div>
          <button
            type="button"
            onClick={onOpenCreate}
            className="h-10 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nueva Habilidad / Meta</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          2. GRID PRINCIPAL: TARJETAS PASTEL (8 COLS) + BITÁCORA DE HITOS (4 COLS)
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* IZQUIERDA (8 COLS): Tarjetas pastelFeatureCard */}
        <div className="lg:col-span-8 space-y-4">
          {filteredSkills.length === 0 ? (
            <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento">
              <SoftBentoEmptyState
                icon={<Flame className="w-5 h-5" />}
                title="Tu Árbol de Habilidades & Metas Físicas está listo"
                description="Crea tu primera habilidad intelectual o tu tarjeta deportiva de Básquet y Fútbol para acumular horas, entrenamientos y XP en Firebase."
                actionLabel="+ Crear primera Habilidad / Deporte"
                onAction={onOpenCreate}
                onAskAssistant={onAskAssistant}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSkills.map((skill) => (
                <PastelSkillCard
                  key={skill.id}
                  skill={skill}
                  onAddHour={onAddHour}
                  onDelete={onDeleteSkill}
                  onSelect={(sk) =>
                    setSelectedSkillId((prev) =>
                      prev === sk.id ? 'all' : sk.id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* DERECHA (4 COLS): Bitácora de Hitos & Récords Personales */}
        <div className="lg:col-span-4 bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <BentoHeader
              icon={<Award className="w-4 h-4" />}
              title="Bitácora de Hitos & Récords"
              countBadge={`${unlockedMilestones} Logros`}
            />

            {skills.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedSkillId('all')}
                    className={`px-3 py-1 rounded-full text-[0.72rem] font-semibold whitespace-nowrap cursor-pointer ${
                      selectedSkillId === 'all'
                        ? 'bg-[#141519] text-white'
                        : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                    }`}
                  >
                    Todos ({allMilestoneEntries.length})
                  </button>
                  {filteredSkills.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSkillId(s.id)}
                      className={`px-3 py-1 rounded-full text-[0.72rem] font-semibold whitespace-nowrap cursor-pointer ${
                        selectedSkillId === s.id
                          ? 'bg-[#141519] text-white'
                          : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                      }`}
                    >
                      {s.name.split('·')[0].trim()}
                    </button>
                  ))}
                </div>

                {onAddMilestone && (
                  <form
                    onSubmit={handleCreateRecord}
                    className="p-3 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] mb-4 space-y-2"
                  >
                    <input
                      type="text"
                      value={newRecordTitle}
                      onChange={(e) => setNewRecordTitle(e.target.value)}
                      placeholder="Ej: Metí 8/10 triples seguidos..."
                      className="w-full h-9 px-3.5 rounded-full bg-white border border-[#EEF1F5] text-[0.78rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519]"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <select
                        aria-label="Habilidad asociada al hito"
                        value={targetRecordSkillId}
                        onChange={(e) => setTargetRecordSkillId(e.target.value)}
                        className="h-8 px-3 rounded-full bg-white border border-[#EEF1F5] text-[0.72rem] font-semibold text-[#141519] truncate max-w-[190px]"
                      >
                        {skills.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="h-8 px-3.5 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.72rem] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Anotar Récord</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {allMilestoneEntries.length === 0 ? (
              <SoftBentoEmptyState
                icon={<Award className="w-5 h-5" />}
                title="Tu Bitácora de Récords está vacía"
                description="Al crear habilidades o entrenar Básquet y Fútbol podrás anotar tus récords personales aquí."
                actionLabel="+ Crear Habilidad"
                onAction={onOpenCreate}
                compact
              />
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {allMilestoneEntries.map(
                  ({ skillId, skillName, skillAccent, milestone }) => (
                    <button
                      key={milestone.id}
                      type="button"
                      onClick={() => onToggleMilestone(skillId, milestone.id)}
                      className={`w-full text-left p-3.5 rounded-[16px] border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                        milestone.unlocked
                          ? 'bg-[#F7F9FB] border-[#EEF1F5] hover:border-[#6CD4CE]'
                          : 'bg-striped-subtle border-[#EEF1F5] hover:border-[#8E95A2]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="mt-0.5 shrink-0">
                          {milestone.unlocked ? (
                            <CheckCircle2 className="w-4 h-4 text-[#141519]" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#8E95A2]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-[0.82rem] font-bold leading-snug ${
                              milestone.unlocked
                                ? 'text-[#141519]'
                                : 'text-[#6E7480]'
                            }`}
                          >
                            {milestone.title}
                          </p>
                          <div className="flex items-center gap-1.5 text-[0.7rem] font-medium text-[#6E7480] mt-1">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                skillAccent === 'mint'
                                  ? 'bg-[#6CD4CE]'
                                  : 'bg-[#9BA9F0]'
                              }`}
                            />
                            <span className="truncate">
                              {skillName.split('·')[0].trim()}
                            </span>
                            {milestone.date && (
                              <span className="text-[#8E95A2]">
                                · {milestone.date}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold shrink-0 whitespace-nowrap ${
                          milestone.unlocked
                            ? skillAccent === 'mint'
                              ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text'
                              : 'bg-[#BBC6F8] text-[#141519] keep-dark-text'
                            : 'bg-white border border-[#EEF1F5] text-[#6E7480]'
                        }`}
                      >
                        {milestone.badge ||
                          (milestone.unlocked ? 'Logrado' : 'En curso')}
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   3. MÓDULO WISHLIST INTELIGENTE (SEPARADA E INDEPENDIENTE)
============================================================================ */
type WishlistTagFilter =
  | 'Todo'
  | 'Tech'
  | 'Deporte / Básquet & Fútbol'
  | 'Setup'
  | 'Caprichos';

interface WishlistViewProps {
  items: WishlistItem[];
  extraSavingsPool: number;
  onUpdateSavingsPool: (nextAmount: number) => void;
  onAddSavings: (itemId: string, amount: number) => void;
  onTogglePurchased?: (itemId: string) => void;
  onDeleteItem?: (item: WishlistItem) => void;
  onOpenCreate: () => void;
  onAskAssistant?: () => void;
}

const WISHLIST_TAG_PILLS: Array<{ id: WishlistTagFilter; label: string }> = [
  { id: 'Todo', label: 'Todo' },
  { id: 'Tech', label: '💻 Tech' },
  { id: 'Deporte / Básquet & Fútbol', label: '🏀⚽ Deporte / Básquet & Fútbol' },
  { id: 'Setup', label: '🖥️ Setup' },
  { id: 'Caprichos', label: '✨ Caprichos' },
];

export const WishlistView: React.FC<WishlistViewProps> = ({
  items,
  extraSavingsPool,
  onUpdateSavingsPool,
  onAddSavings,
  onTogglePurchased,
  onDeleteItem,
  onOpenCreate,
  onAskAssistant,
}) => {
  const [selectedTag, setSelectedTag] = useState<WishlistTagFilter>('Todo');
  const [selectedPriority, setSelectedPriority] = useState<
    'Todas' | WishlistPriority
  >('Todas');

  const inferItemTag = (
    item: WishlistItem
  ): Exclude<WishlistTagFilter, 'Todo'> => {
    if (item.wishlistTag) return item.wishlistTag;
    const cat = item.category.toLowerCase();
    if (
      cat.includes('deporte') ||
      cat.includes('básquet') ||
      cat.includes('fútbol')
    ) {
      return 'Deporte / Básquet & Fútbol';
    }
    if (cat.includes('setup')) return 'Setup';
    if (cat.includes('capricho')) return 'Caprichos';
    return 'Tech';
  };

  const filtered = items.filter((item) => {
    const matchesTag =
      selectedTag === 'Todo' || inferItemTag(item) === selectedTag;
    const matchesPriority =
      selectedPriority === 'Todas' || item.priority === selectedPriority;
    return matchesTag && matchesPriority;
  });

  const totalGoal = items.reduce((acc, i) => acc + i.estimatedPrice, 0);
  const totalAssignedSavings = items.reduce((acc, i) => acc + i.savedAmount, 0);
  const totalAvailableLiquidity = totalAssignedSavings + extraSavingsPool;
  const overallPercent =
    totalGoal > 0
      ? Math.min(100, Math.round((totalAvailableLiquidity / totalGoal) * 100))
      : 0;

  const buyableTodayItems = items.filter(
    (i) =>
      !i.purchased &&
      (i.savedAmount >= i.estimatedPrice ||
        i.savedAmount + extraSavingsPool >= i.estimatedPrice)
  );

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. BARRA DE FILTROS EN PÍLDORAS POR CATEGORÍA + BOTÓN NUEVA META
      ==================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {WISHLIST_TAG_PILLS.map((pill) => {
            const isActive = selectedTag === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSelectedTag(pill.id)}
                className={`rounded-full px-4 py-2.5 text-[0.82rem] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#141519] text-white shadow-xs'
                    : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['Todas', 'Alta', 'Media', 'Capricho'] as const).map((prio) => (
            <button
              key={prio}
              type="button"
              onClick={() => setSelectedPriority(prio)}
              className={`h-9 px-3.5 rounded-full text-[0.76rem] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                selectedPriority === prio
                  ? 'bg-[#141519] text-white'
                  : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
              }`}
            >
              {prio === 'Todas' ? 'Prioridad: Todas' : prio}
            </button>
          ))}

          <button
            type="button"
            onClick={onOpenCreate}
            className="h-10 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Añadir a Wishlist</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          2. WIDGET BENTO SUPERIOR: PRESUPUESTO Y AHORRO DISPONIBLE
      ==================================================================== */}
      <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-[14px] bg-[#A8E6E3] text-[#141519] keep-dark-text flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-[0.74rem] font-semibold text-[#6E7480]">
                    Fondo de Ahorro Disponible
                  </span>
                  <h2 className="text-[1.25rem] font-bold text-[#141519] tabular-nums">
                    ${totalAvailableLiquidity.toLocaleString()} USD{' '}
                    <span className="text-[0.82rem] font-semibold text-[#6E7480]">
                      de ${totalGoal.toLocaleString()} USD ({overallPercent}%)
                    </span>
                  </h2>
                </div>
              </div>

              {/* Control interactivo para ajustar el fondo libre disponible en Firestore */}
              <div className="flex items-center gap-1.5 bg-[#F7F9FB] p-1.5 rounded-full border border-[#EEF1F5]">
                <span className="text-[0.72rem] font-semibold text-[#6E7480] pl-2.5 tabular-nums">
                  Fondo Libre: ${extraSavingsPool}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSavingsPool(Math.max(0, extraSavingsPool - 50))
                  }
                  className="w-7 h-7 rounded-full bg-white hover:bg-[#EBF0F5] text-[#141519] text-xs font-bold cursor-pointer border border-[#EEF1F5]"
                  title="Restar $50 al fondo libre"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSavingsPool(extraSavingsPool + 50)}
                  className="px-2.5 h-7 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold cursor-pointer"
                  title="Sumar +$50 al fondo libre"
                >
                  +$50
                </button>
              </div>
            </div>

            <div className="bg-[#F7F9FB] rounded-[18px] p-4 border border-[#EEF1F5]">
              <div className="flex items-center justify-between text-[0.76rem] font-semibold text-[#141519] mb-2 tabular-nums">
                <span>
                  Ahorro Asignado en Productos: $
                  {totalAssignedSavings.toLocaleString()} USD
                </span>
                <span className="text-[#6E7480]">
                  Restan $
                  {Math.max(
                    0,
                    totalGoal - totalAvailableLiquidity
                  ).toLocaleString()}{' '}
                  USD
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-striped-pattern border border-[#EEF1F5] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-mint-gradient transition-all duration-300"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-mint-gradient inner-card-stroke rounded-[20px] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-3 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-bold">
                ⚡ Disponibles para comprar hoy ({buyableTodayItems.length})
              </span>
            </div>

            <div className="space-y-2">
              {buyableTodayItems.slice(0, 3).map((readyItem) => (
                <div
                  key={readyItem.id}
                  className="px-3.5 py-2 rounded-full bg-white/85 text-[#141519] keep-dark-text flex items-center justify-between gap-2 text-[0.76rem] font-bold shadow-2xs"
                >
                  <span className="truncate">✓ {readyItem.name}</span>
                  <span className="tabular-nums shrink-0">
                    ${readyItem.estimatedPrice}
                  </span>
                </div>
              ))}
              {buyableTodayItems.length === 0 && (
                <div className="px-3.5 py-2 rounded-full bg-white/70 text-[#141519] keep-dark-text text-[0.75rem] font-semibold">
                  Agrega un artículo o suma +$50 a tu Fondo Libre para ver qué puedes comprar hoy.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. GRID DE TARJETAS DE PRODUCTOS (WISHLIST CATALOG)
      ==================================================================== */}
      {filtered.length === 0 ? (
        <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento">
          <SoftBentoEmptyState
            icon={<ShoppingBag className="w-5 h-5" />}
            title="Tu Wishlist Inteligente está lista para tu primera meta"
            description="Guarda el equipamiento deportivo de Básquet/Fútbol, tecnología o setup que planeas comprar y calcula qué puedes adquirir hoy con tu ahorro."
            actionLabel="+ Añadir primer producto"
            onAction={onOpenCreate}
            onAskAssistant={onAskAssistant}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const pct = Math.min(
              100,
              Math.round((item.savedAmount / item.estimatedPrice) * 100)
            );
            const readyDirect = pct >= 100;
            const canBuyWithPool =
              !readyDirect &&
              item.savedAmount + extraSavingsPool >= item.estimatedPrice;
            const isPurchased = Boolean(item.purchased);
            const tagLabel = inferItemTag(item);

            return (
              <div
                key={item.id}
                className={`bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 ${
                  isPurchased ? 'opacity-80' : ''
                }`}
              >
                <div>
                  <div className="relative h-38 rounded-[18px] overflow-hidden mb-4 border border-[#EEF1F5]">
                    <VisualArtwork
                      variant={item.artVariant}
                      accent={item.accent}
                    />
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[0.68rem] font-bold ${
                          item.priority === 'Alta'
                            ? 'bg-[#141519] text-white'
                            : item.priority === 'Media'
                            ? 'bg-white/95 text-[#141519] keep-dark-text'
                            : 'bg-[#BBC6F8] text-[#141519] keep-dark-text'
                        }`}
                      >
                        Prioridad {item.priority}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-white/90 text-[#141519] keep-dark-text text-[0.68rem] font-bold">
                        {tagLabel}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-xs text-[#141519] keep-dark-text text-[0.78rem] font-bold tabular-nums shadow-2xs">
                      ${item.estimatedPrice.toLocaleString()}
                    </div>

                    <div className="absolute bottom-2.5 left-3">
                      {isPurchased ? (
                        <span className="px-3 py-1 rounded-full bg-[#141519] text-[#A8E6E3] text-[0.68rem] font-bold">
                          ✓ Adquirido
                        </span>
                      ) : readyDirect ? (
                        <span className="px-3 py-1 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.68rem] font-bold shadow-2xs">
                          ⚡ ¡Listo para comprar hoy! (100%)
                        </span>
                      ) : canBuyWithPool ? (
                        <span className="px-3 py-1 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.68rem] font-bold shadow-2xs">
                          💡 Comprable hoy usando Fondo Libre
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-white/90 text-[#6E7480] text-[0.68rem] font-bold">
                          ⏳ En proceso de ahorro
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[0.72rem] font-semibold text-[#8E95A2]">
                      {item.category}
                    </span>
                    {onDeleteItem && (
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item)}
                        title="Eliminar de Wishlist"
                        aria-label="Eliminar de Wishlist"
                        className="w-7 h-7 rounded-full bg-[#F7F9FB] hover:bg-[#F28B82] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <h3
                    className={`text-[1.05rem] font-bold text-[#141519] mb-1.5 ${
                      isPurchased ? 'line-through' : ''
                    }`}
                  >
                    {item.name}
                  </h3>
                  <p className="text-[0.8rem] text-[#6E7480] mb-4 leading-relaxed">
                    {item.notes}
                  </p>
                </div>

                <div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[0.75rem] font-semibold text-[#141519] mb-1.5 tabular-nums">
                      <span>
                        Ahorrado: ${item.savedAmount.toLocaleString()} / $
                        {item.estimatedPrice.toLocaleString()}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-striped-pattern border border-[#EEF1F5] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.accent === 'mint'
                            ? 'bg-[#6CD4CE]'
                            : 'bg-[#9BA9F0]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {!readyDirect && !isPurchased && (
                      <button
                        type="button"
                        onClick={() => onAddSavings(item.id, 50)}
                        className="flex-1 h-9 px-3 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.75rem] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="tabular-nums">Abonar +$50</span>
                      </button>
                    )}

                    {onTogglePurchased && (
                      <button
                        type="button"
                        onClick={() => onTogglePurchased(item.id)}
                        className={`h-9 px-3.5 rounded-full text-[0.74rem] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          readyDirect || isPurchased
                            ? 'flex-1 bg-[#A8E6E3] text-[#141519] keep-dark-text'
                            : 'bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#141519] border border-[#EEF1F5]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {isPurchased
                            ? '¡Comprado!'
                            : readyDirect
                            ? 'Marcar Comprado'
                            : 'Comprar'}
                        </span>
                      </button>
                    )}

                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Ver tienda"
                      className="w-9 h-9 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] flex items-center justify-center transition-colors shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   4. MÓDULO CALENDARIO & CRONOGRAMA (GOOGLE CALENDAR & GOOGLE TASKS REAL SYNC)
============================================================================ */
interface CalendarViewProps {
  calendarDays: CalendarDay[];
  selectedDay: number;
  onSelectDay: (day: number) => void;
  scheduleBlocks: ScheduleBlock[];
  onToggleBlock: (blockId: string) => void;
  onDeleteBlock?: (block: ScheduleBlock) => void;
  onOpenCreateSchedule: () => void;
  googleTasks: GoogleTaskItem[];
  onCreateGoogleTask: (title: string, notes?: string) => void;
  onToggleGoogleTask: (task: GoogleTaskItem) => void;
  onDeleteGoogleTask: (task: GoogleTaskItem) => void;
  isGoogleConnected: boolean;
  isSyncingGoogle: boolean;
  onConnectGoogle: () => void;
  onRefreshGoogle: () => void;
  onAskAssistant?: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  calendarDays,
  selectedDay,
  onSelectDay,
  scheduleBlocks,
  onToggleBlock,
  onDeleteBlock,
  onOpenCreateSchedule,
  googleTasks,
  onCreateGoogleTask,
  onToggleGoogleTask,
  onDeleteGoogleTask,
  isGoogleConnected,
  isSyncingGoogle,
  onConnectGoogle,
  onRefreshGoogle,
  onAskAssistant,
}) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const dayBlocks = scheduleBlocks.filter((b) => b.dayOfMonth === selectedDay);
  const displayBlocks = dayBlocks.length > 0 ? dayBlocks : scheduleBlocks;

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    onCreateGoogleTask(newTaskTitle.trim());
    setNewTaskTitle('');
  };

  return (
    <div className="space-y-6">
      {/* Top Google OAuth 2.0 Connection Banner */}
      <div className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#EEF1F5] shadow-bento flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[16px] bg-mint-gradient inner-card-stroke flex items-center justify-center text-[#141519] keep-dark-text shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[1rem] font-bold text-[#141519]">
                Google Calendar & Tasks
              </h2>
              {isGoogleConnected && (
                <span className="px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold bg-[#A8E6E3] text-[#141519] keep-dark-text">
                  ● Sincronizado
                </span>
              )}
            </div>
            <p className="text-[0.76rem] font-medium text-[#6E7480]">
              {isGoogleConnected
                ? 'Tus eventos y tareas están sincronizados en tiempo real.'
                : 'Conecta tu cuenta para sincronizar eventos y tareas.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isGoogleConnected ? (
            <button
              type="button"
              onClick={onRefreshGoogle}
              disabled={isSyncingGoogle}
              className="h-10 px-4 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] text-[0.78rem] font-semibold flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncingGoogle ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isSyncingGoogle ? 'Sincronizando...' : 'Sincronizar Ahora'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectGoogle}
              className="h-10 px-5 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-[#A8E6E3]" />
              <span>Conectar Google Calendar & Tasks</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left (4 cols): Circular Calendar Matrix */}
        <div className="lg:col-span-4 bg-white rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <BentoHeader
              icon={<CalendarIcon className="w-4 h-4" />}
              title="Matriz Circular del Mes"
              countBadge={`Día ${selectedDay}`}
            />

            <CalendarMatrix
              days={calendarDays}
              selectedDay={selectedDay}
              onSelectDay={onSelectDay}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-[#EEF1F5] flex flex-wrap items-center gap-4 text-[0.74rem] font-semibold text-[#6E7480]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#A8E6E3] inline-block" />
              <span>Calendar Event</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#BBC6F8] inline-block" />
              <span>Hitos / Tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#141519] inline-block" />
              <span>Seleccionado</span>
            </div>
          </div>
        </div>

        {/* Center (5 cols): Horizontal Capsule Timeline Schedule (Google Calendar Events) */}
        <div className="lg:col-span-5 bg-white rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <BentoHeader
              icon={<Clock className="w-4 h-4" />}
              title={`Eventos · Día ${selectedDay}`}
              countBadge={`${displayBlocks.length} Eventos`}
              rightSlot={
                <button
                  type="button"
                  onClick={onOpenCreateSchedule}
                  className="h-8 px-3.5 rounded-full bg-[#141519] text-white text-[0.74rem] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Evento</span>
                </button>
              }
            />

            <TimelineSchedule
              blocks={displayBlocks}
              onToggleBlock={onToggleBlock}
              onDeleteBlock={onDeleteBlock}
              onOpenCreate={onOpenCreateSchedule}
              onAskAssistant={onAskAssistant}
            />
          </div>
        </div>

        {/* Right (3 cols): Google Tasks (@default) Real Sync */}
        <div className="lg:col-span-3 bg-white rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
          <div>
            <BentoHeader
              icon={<ListTodo className="w-4 h-4" />}
              title="Google Tasks"
              countBadge={googleTasks.length}
            />

            <form onSubmit={handleAddTaskSubmit} className="mb-4 flex gap-1.5">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Nueva tarea en Tasks..."
                className="flex-1 h-9 px-3.5 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.78rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519]"
              />
              <button
                type="submit"
                className="w-9 h-9 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white flex items-center justify-center shrink-0 cursor-pointer"
                title="Crear tarea en Google Tasks"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {googleTasks.length === 0 ? (
              <SoftBentoEmptyState
                icon={<ListTodo className="w-5 h-5" />}
                title="Sin tareas pendientes"
                description="Agrega una tarea arriba o pídele al Asistente IA que cree un to-do en tu Google Tasks."
                actionLabel="+ Crear primera Tarea"
                onAction={() => onCreateGoogleTask('Entrenamiento de tiro 30m')}
                compact
              />
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {googleTasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  return (
                    <div
                      key={task.id}
                      className={`p-3 rounded-[16px] border flex items-center justify-between gap-2 transition-all ${
                        isCompleted
                          ? 'bg-striped-subtle border-[#EEF1F5] opacity-75'
                          : 'bg-[#F7F9FB] border-[#EEF1F5] hover:border-[#6CD4CE]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleGoogleTask(task)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-[#141519] shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-[#8E95A2] shrink-0" />
                        )}
                        <span
                          className={`text-[0.8rem] font-semibold truncate ${
                            isCompleted
                              ? 'line-through text-[#6E7480]'
                              : 'text-[#141519]'
                          }`}
                        >
                          {task.title}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteGoogleTask(task)}
                        title="Eliminar tarea"
                        aria-label="Eliminar tarea"
                        className="w-6 h-6 rounded-full hover:bg-[#F28B82] text-[#8E95A2] hover:text-[#141519] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
