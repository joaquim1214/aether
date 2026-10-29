import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Eye,
  Film,
  Lightbulb,
  Loader2,
  MapPin,
  Music,
  Pause,
  Play,
  Search,
  Tv,
  User,
  Video,
  X,
} from 'lucide-react';
import {
  ScheduleBlock,
  SkillItem,
  VaultCategory,
  VaultFilterId,
  VaultItem,
  VaultTier,
  WishlistItem,
  WishlistPriority,
} from '../types/lifeOs';
import {
  computeReleaseCountdown,
  MediaSearchResult,
  searchMediaByCategory,
} from '../services/mediaSearchService';
import { resolveAudioPreviewForTrack } from '../services/spotifyService';

type ModalMode = 'vault' | 'skill' | 'wishlist' | 'schedule' | null;

interface QuickCreateModalProps {
  mode: ModalMode;
  defaultVaultGroup?: Exclude<VaultFilterId, 'todo'>;
  editingVaultItem?: VaultItem | null;
  onClose: () => void;
  onAddVault: (item: Omit<VaultItem, 'id'>) => void;
  onUpdateVault?: (item: VaultItem) => void;
  onAddSkill: (item: Omit<SkillItem, 'id'>) => void;
  onAddWishlist: (item: Omit<WishlistItem, 'id'>) => void;
  onAddSchedule: (item: Omit<ScheduleBlock, 'id'>) => void;
  onPreviewSearchResult?: (
    item: MediaSearchResult,
    onSelectFromPreview: (
      selected: MediaSearchResult,
      targetGroup?: Exclude<VaultFilterId, 'todo'>
    ) => void
  ) => void;
}

const ModalAudioWave: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    viewBox="0 0 18 16"
    fill="currentColor"
    className="w-3.5 h-3 shrink-0"
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

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  mode,
  defaultVaultGroup = 'peliculas_series',
  editingVaultItem = null,
  onClose,
  onAddVault,
  onUpdateVault,
  onAddSkill,
  onAddWishlist,
  onAddSchedule,
  onPreviewSearchResult,
}) => {
  const todayIso = new Date().toISOString().split('T')[0];

  // Vault adaptable form state
  const [vGroup, setVGroup] = useState<Exclude<VaultFilterId, 'todo'>>(
    defaultVaultGroup
  );
  const [vTitle, setVTitle] = useState('');
  const [vCreator, setVCreator] = useState('');
  const [vRating, setVRating] = useState('9.5');
  const [vTags, setVTags] = useState('Sci-Fi, Obra Maestra');
  const [vReview, setVReview] = useState('');
  const [vImageUrl, setVImageUrl] = useState('');
  const [vAudioPreviewUrl, setVAudioPreviewUrl] = useState('');
  const [vReleaseYear, setVReleaseYear] = useState('');
  const [vImdbId, setVImdbId] = useState('');
  const [vImdbRating, setVImdbRating] = useState('');
  const [vImdbVotes, setVImdbVotes] = useState('');
  const [vActors, setVActors] = useState('');
  const [vPlot, setVPlot] = useState('');
  const [vMediaCategoryOverride, setVMediaCategoryOverride] =
    useState<VaultCategory | null>(null);

  // Clean Media & IMDb / Spotify Autocomplete state (300ms debounce)
  const [magicQuery, setMagicQuery] = useState('');
  const [magicResults, setMagicResults] = useState<MediaSearchResult[]>([]);
  const [isSearchingMedia, setIsSearchingMedia] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingModalPreview, setIsPlayingModalPreview] = useState(false);
  const [isResolvingModalPreview, setIsResolvingModalPreview] = useState(false);

  // ⏳ Próximamente (Hype Radar) specific fields
  const initialFutureCountdown = computeReleaseCountdown();
  const [vReleaseIsoDate, setVReleaseIsoDate] = useState(
    initialFutureCountdown.isoDate
  );
  const [vReleaseDate, setVReleaseDate] = useState(
    initialFutureCountdown.formattedDate
  );
  const [vDaysRemaining, setVDaysRemaining] = useState(
    String(initialFutureCountdown.daysRemaining)
  );
  const [vHypeLevel, setVHypeLevel] = useState('95');
  const [vReleaseFormat, setVReleaseFormat] = useState('Cine / IMAX');
  const [hasManualDateOverride, setHasManualDateOverride] = useState(false);

  // ▶️ Videos & Canales specific fields
  const [vDuration, setVDuration] = useState('24:15');
  const [vVideoUrl, setVVideoUrl] = useState('');
  const [vKeyTakeaway, setVKeyTakeaway] = useState('');

  // 👥 Personas specific fields
  const [vRelationship, setVRelationship] = useState<
    'Amigo' | 'Referente' | 'Equipo' | 'Familia' | 'Mentor'
  >('Amigo');
  const [vBirthday, setVBirthday] = useState('');

  // ✨ Momentos / Otros specific fields
  const [vMomentDateIso, setVMomentDateIso] = useState(todayIso);
  const [vLocation, setVLocation] = useState('');

  const stopModalAudio = () => {
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      modalAudioRef.current = null;
    }
    setIsPlayingModalPreview(false);
  };

  const resetCategoryFields = (nextGroup: Exclude<VaultFilterId, 'todo'>) => {
    stopModalAudio();
    setMagicQuery('');
    setMagicResults([]);
    setShowDropdown(false);
    setVTitle('');
    setVCreator('');
    setVReview('');
    setVImageUrl('');
    setVAudioPreviewUrl('');
    setVReleaseYear('');
    setVImdbId('');
    setVImdbRating('');
    setVImdbVotes('');
    setVActors('');
    setVPlot('');
    setVVideoUrl('');
    setVKeyTakeaway('');
    setVMediaCategoryOverride(null);
    setHasManualDateOverride(false);

    if (nextGroup === 'peliculas_series') {
      setVTags('Sci-Fi, Favorito');
      setVRating('9.5');
    } else if (nextGroup === 'proximamente') {
      const nextDefaultFuture = computeReleaseCountdown();
      setVReleaseIsoDate(nextDefaultFuture.isoDate);
      setVReleaseDate(nextDefaultFuture.formattedDate);
      setVDaysRemaining(String(nextDefaultFuture.daysRemaining));
      setVTags('Estreno, Hype');
      setVHypeLevel('95');
      setVReleaseFormat('Cine / IMAX');
    } else if (nextGroup === 'musica') {
      setVTags('Synthwave, Focus');
      setVRating('9.5');
    } else if (nextGroup === 'videos') {
      setVTags('Ensayo, Aprendizaje');
      setVRating('9.2');
    } else if (nextGroup === 'personas') {
      setVTags('Cercano, Inspiración');
      setVRelationship('Amigo');
      setVBirthday('');
    } else if (nextGroup === 'momentos') {
      setVTags('Recuerdo, Vida');
      setVMomentDateIso(todayIso);
      setVLocation('');
    }
  };

  const populateFromExistingVaultItem = (item: VaultItem) => {
    stopModalAudio();
    setMagicQuery('');
    setMagicResults([]);
    setShowDropdown(false);
    setVGroup(item.vaultGroup);
    setVTitle(item.title || '');
    setVCreator(item.creator || '');
    setVRating(String(item.rating ?? 9.5));
    setVTags((item.tags || []).join(', '));
    setVReview(item.review || '');
    setVImageUrl(item.imageUrl || '');
    setVAudioPreviewUrl(item.audioPreviewUrl || '');
    setVReleaseYear(item.releaseYear || '');
    setVImdbId(item.imdbId || '');
    setVImdbRating(item.imdbRating || '');
    setVImdbVotes(item.imdbVotes || '');
    setVActors(item.actors || '');
    setVPlot(item.plot || '');
    setVMediaCategoryOverride(
      item.category === 'Cine' || item.category === 'Serie'
        ? item.category
        : null
    );
    setHasManualDateOverride(false);

    // Próximamente fields
    const countdown = computeReleaseCountdown(item.releaseDate);
    setVReleaseIsoDate(countdown.isoDate);
    setVReleaseDate(countdown.formattedDate);
    setVDaysRemaining(
      String(
        typeof item.daysRemaining === 'number'
          ? item.daysRemaining
          : countdown.daysRemaining
      )
    );
    setVHypeLevel(String(item.hypeLevel ?? 95));
    setVReleaseFormat(item.releaseFormat || item.creator || 'Cine / IMAX');

    // Videos & Música fields
    setVDuration(item.duration || '24:15');
    setVVideoUrl(item.videoUrl || '');
    setVKeyTakeaway(item.keyTakeaway || item.review || '');

    // Personas fields
    setVRelationship(item.relationshipTag || 'Amigo');
    const parsedBirthday = (item.personMeta || '')
      .replace(/^Cumpleaños:\s*/i, '')
      .trim();
    setVBirthday(parsedBirthday);

    // Momentos fields
    setVLocation(
      item.location ||
        (item.vaultGroup === 'momentos' && item.creator !== 'Momento Personal'
          ? item.creator
          : '')
    );
    if (item.consumedDate && item.consumedDate !== 'En Espera') {
      const parsedDate = computeReleaseCountdown(item.consumedDate);
      setVMomentDateIso(parsedDate.isoDate || todayIso);
    } else {
      setVMomentDateIso(todayIso);
    }
  };

  useEffect(() => {
    if (mode === 'vault' && editingVaultItem) {
      populateFromExistingVaultItem(editingVaultItem);
    } else {
      setVGroup(defaultVaultGroup);
      resetCategoryFields(defaultVaultGroup);
    }
  }, [defaultVaultGroup, mode, editingVaultItem]);

  useEffect(() => {
    return () => {
      stopModalAudio();
    };
  }, []);

  // 300ms Debounced Live API Search (TMDB/IMDb, Estrenos, Spotify, YouTube)
  useEffect(() => {
    if (
      mode !== 'vault' ||
      vGroup === 'personas' ||
      vGroup === 'momentos' ||
      magicQuery.trim().length < 2
    ) {
      setMagicResults([]);
      setIsSearchingMedia(false);
      return;
    }

    let cancelled = false;
    setIsSearchingMedia(true);

    const timer = window.setTimeout(async () => {
      const results = await searchMediaByCategory(magicQuery, vGroup, true);
      if (!cancelled) {
        setMagicResults(results);
        setShowDropdown(true);
        setIsSearchingMedia(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [magicQuery, vGroup, mode]);

  const handleVideoUrlChange = async (nextUrl: string) => {
    setVVideoUrl(nextUrl);
    if (nextUrl.includes('youtube.com/') || nextUrl.includes('youtu.be/')) {
      setIsSearchingMedia(true);
      const results = await searchMediaByCategory(nextUrl, 'videos', false);
      setIsSearchingMedia(false);
      if (results.length > 0) {
        handleSelectMediaResult(results[0]);
      }
    }
  };

  const handleSelectMediaResult = (item: MediaSearchResult) => {
    stopModalAudio();
    setVTitle(item.title);
    setVCreator(item.creator);
    if (item.tags.length > 0) {
      setVTags(item.tags.join(', '));
    }
    setVImageUrl(item.imageUrl || '');
    setVAudioPreviewUrl(item.audioPreviewUrl || '');
    setVReleaseYear(item.year || '');
    setVImdbId(item.imdbId || '');
    setVImdbRating(item.imdbRating || '');
    setVImdbVotes(item.imdbVotes || '');
    setVActors(item.actors || '');
    if (item.plot) {
      setVPlot(item.plot);
      if (vGroup === 'peliculas_series' && !vReview.trim()) {
        setVReview(item.plot);
      }
    }
    if (item.videoUrl) {
      setVVideoUrl(item.videoUrl);
    }
    if (item.releaseFormat) {
      setVReleaseFormat(item.releaseFormat);
    }

    if (vGroup === 'peliculas_series') {
      setVMediaCategoryOverride(item.mediaType === 'movie' ? 'Cine' : 'Serie');
    } else {
      setVMediaCategoryOverride(null);
    }

    if (vGroup === 'proximamente') {
      // If user already manually edited the release date, do NOT let an ambiguous or past API date overwrite it
      const apiRawDate = item.rawReleaseDate || item.releaseDate || item.year;
      if (apiRawDate) {
        const calc = computeReleaseCountdown(apiRawDate);
        if (!hasManualDateOverride || calc.isFuture) {
          setVReleaseIsoDate(calc.isoDate);
          setVReleaseDate(calc.formattedDate);
          setVDaysRemaining(String(calc.daysRemaining));
        }
      }
    }

    setMagicQuery(item.title);
    setShowDropdown(false);
  };

  const handleToggleModalAudioPreview = async () => {
    if (isPlayingModalPreview && modalAudioRef.current) {
      stopModalAudio();
      return;
    }

    let url = vAudioPreviewUrl.trim();
    if (!url && vTitle.trim()) {
      setIsResolvingModalPreview(true);
      const resolved = await resolveAudioPreviewForTrack(vTitle, vCreator);
      setIsResolvingModalPreview(false);
      if (resolved) {
        url = resolved;
        setVAudioPreviewUrl(resolved);
      }
    }

    if (!url) return;

    try {
      stopModalAudio();
      const audio = new Audio(url);
      audio.volume = 0.85;
      modalAudioRef.current = audio;
      audio.onended = () => setIsPlayingModalPreview(false);
      audio.onerror = () => setIsPlayingModalPreview(false);
      await audio.play();
      setIsPlayingModalPreview(true);
    } catch {
      setIsPlayingModalPreview(false);
    }
  };

  const handleReleaseDatePickerChange = (isoValue: string) => {
    setHasManualDateOverride(true);
    setVReleaseIsoDate(isoValue);
    if (!isoValue) return;
    const calc = computeReleaseCountdown(isoValue);
    setVReleaseDate(calc.formattedDate);
    setVDaysRemaining(String(calc.daysRemaining));
  };

  const handleMoveUpcomingToWatched = () => {
    setVGroup('peliculas_series');
    setHasManualDateOverride(false);
    if (!vReview.trim() && vPlot.trim()) {
      setVReview(vPlot.trim());
    }
  };

  // Skill form state
  const [sBranch, setSBranch] = useState<'learning' | 'sports'>('learning');
  const [sName, setSName] = useState('');
  const [sCategory, setSCategory] = useState('Ingeniería & Diseño');
  const [sLevel, setSLevel] = useState('1');
  const [sHours, setSHours] = useState('10');
  const [sAccent, setSAccent] = useState<'mint' | 'lavender'>('mint');
  const [sTags, setSTags] = useState('Práctica, Deep Work');
  const [sSportStats, setSSportStats] = useState('');

  // Wishlist form state
  const [wName, setWName] = useState('');
  const [wTag, setWTag] = useState<
    'Tech' | 'Deporte / Básquet & Fútbol' | 'Setup' | 'Caprichos'
  >('Tech');
  const [wCategory, setWCategory] = useState('Setup & Tech');
  const [wPrice, setWPrice] = useState('350');
  const [wSaved, setWSaved] = useState('100');
  const [wPriority, setWPriority] = useState<WishlistPriority>('Alta');
  const [wNotes, setWNotes] = useState('');

  // Schedule form state
  const [cTitle, setCTitle] = useState('');
  const [cTime, setCTime] = useState('17:00 - 18:30');
  const [cDay, setCDay] = useState(String(new Date().getDate()));
  const [cAccent, setCAccent] = useState<'mint' | 'lavender'>('mint');

  if (!mode) return null;

  const formatIsoToSpanishDate = (iso: string): string => {
    if (!iso) {
      return new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    const parsed = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    stopModalAudio();

    if (mode === 'vault' && vTitle.trim()) {
      const numRating =
        vGroup === 'proximamente'
          ? 9.0
          : Math.min(10, Math.max(1, parseFloat(vRating) || 9.5));
      const tier: VaultTier =
        numRating >= 9 ? 'S' : numRating >= 7.8 ? 'A' : 'B';

      const categoryMap: Record<Exclude<VaultFilterId, 'todo'>, VaultCategory> =
        {
          peliculas_series: vMediaCategoryOverride || 'Cine',
          proximamente: 'Próximamente',
          musica: 'Música',
          videos: 'Video',
          personas: 'Persona',
          momentos: 'Momento',
        };

      const todayFormatted = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const consumedDateValue =
        vGroup === 'proximamente'
          ? 'En Espera'
          : vGroup === 'momentos'
          ? formatIsoToSpanishDate(vMomentDateIso)
          : editingVaultItem &&
            editingVaultItem.vaultGroup === vGroup &&
            editingVaultItem.consumedDate &&
            editingVaultItem.consumedDate !== 'En Espera'
          ? editingVaultItem.consumedDate
          : todayFormatted;

      const parsedTags = vTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const finalTags =
        parsedTags.length > 0
          ? parsedTags
          : vGroup === 'proximamente'
          ? [vReleaseFormat || 'Estreno']
          : vGroup === 'personas'
          ? [vRelationship]
          : vGroup === 'momentos'
          ? [vLocation || 'Recuerdo']
          : ['Favorito'];

      const computedCreator =
        vGroup === 'proximamente'
          ? vCreator.trim() || vReleaseFormat.trim() || 'Estreno Oficial'
          : vGroup === 'personas'
          ? vRelationship
          : vGroup === 'momentos'
          ? vLocation.trim() || 'Momento Personal'
          : vCreator.trim() || 'Autor';

      const computedReview =
        vGroup === 'proximamente'
          ? vReview.trim() ||
            `Esperando estreno en ${vReleaseFormat || 'Cartelera'} (${vReleaseDate}). Nivel de Hype: ${vHypeLevel}%.`
          : vGroup === 'videos'
          ? vKeyTakeaway.trim() ||
            vReview.trim() ||
            'Aprendizaje clave registrado desde YouTube.'
          : vGroup === 'musica'
          ? vReview.trim() ||
            `Canción / álbum de ${vCreator.trim() || 'Spotify'} en rotación.`
          : vReview.trim() ||
            vPlot.trim() ||
            'Experiencia registrada en mi Bóveda de Aether.';

      const personInitials =
        vGroup === 'personas'
          ? vTitle
              .trim()
              .split(' ')
              .filter(Boolean)
              .map((w) => w[0]?.toUpperCase())
              .join('')
              .slice(0, 2)
          : undefined;

      const vaultPayload: Omit<VaultItem, 'id'> = {
        title: vTitle.trim(),
        creator: computedCreator,
        category: categoryMap[vGroup],
        vaultGroup: vGroup,
        rating: numRating,
        tier,
        consumedDate: consumedDateValue,
        tags: finalTags.slice(0, 8),
        review: computedReview,
        accent:
          editingVaultItem && editingVaultItem.vaultGroup === vGroup
            ? editingVaultItem.accent
            : vGroup === 'proximamente' || vGroup === 'personas'
            ? 'lavender'
            : 'mint',
        artVariant:
          vGroup === 'musica'
            ? 'synth'
            : vGroup === 'videos'
            ? 'display'
            : vGroup === 'personas' || vGroup === 'momentos'
            ? 'japan'
            : 'cyberpunk',
        isFeaturedMasterpiece: vGroup !== 'proximamente' && tier === 'S',
        imageUrl: vImageUrl.trim() || undefined,
        audioPreviewUrl:
          vGroup === 'musica' && vAudioPreviewUrl.trim()
            ? vAudioPreviewUrl.trim()
            : undefined,
        releaseYear: vReleaseYear.trim() || undefined,
        imdbId: vImdbId.trim() || undefined,
        imdbRating: vImdbRating.trim() || undefined,
        imdbVotes: vImdbVotes.trim() || undefined,
        actors: vActors.trim() || undefined,
        plot: vPlot.trim() || undefined,
        releaseDate:
          vGroup === 'proximamente'
            ? computeReleaseCountdown(vReleaseIsoDate || vReleaseDate)
                .formattedDate
            : undefined,
        daysRemaining:
          vGroup === 'proximamente'
            ? Math.max(
                0,
                computeReleaseCountdown(vReleaseIsoDate || vReleaseDate)
                  .daysRemaining
              )
            : undefined,
        hypeLevel:
          vGroup === 'proximamente'
            ? Math.min(100, Math.max(0, parseInt(vHypeLevel, 10) || 95))
            : undefined,
        releaseFormat: vGroup === 'proximamente' ? vReleaseFormat : undefined,
        duration: vGroup === 'videos' ? vDuration : undefined,
        videoUrl:
          (vGroup === 'videos' || vGroup === 'musica') && vVideoUrl.trim()
            ? vVideoUrl.trim()
            : undefined,
        keyTakeaway:
          vGroup === 'videos'
            ? vKeyTakeaway.trim() || 'Aprendizaje clave aplicable.'
            : undefined,
        relationshipTag: vGroup === 'personas' ? vRelationship : undefined,
        personInitials,
        personMeta:
          vGroup === 'personas' && vBirthday.trim()
            ? `Cumpleaños: ${vBirthday.trim()}`
            : undefined,
        location:
          vGroup === 'momentos' && vLocation.trim()
            ? vLocation.trim()
            : undefined,
      };

      if (editingVaultItem && onUpdateVault) {
        onUpdateVault({
          ...vaultPayload,
          id: editingVaultItem.id,
          createdAt: editingVaultItem.createdAt,
        });
      } else {
        onAddVault(vaultPayload);
      }
      onClose();
    } else if (mode === 'skill' && sName.trim()) {
      onAddSkill({
        name: sName.trim(),
        category:
          sCategory.trim() ||
          (sBranch === 'sports'
            ? 'Deporte & Rendimiento'
            : 'Desarrollo Personal'),
        branch: sBranch,
        unitLabel: sBranch === 'sports' ? 'Entrenamientos' : 'h',
        sportStats:
          sBranch === 'sports' ? sSportStats.trim() || undefined : undefined,
        level: parseInt(sLevel, 10) || 1,
        progress: 35,
        hoursInvested: parseFloat(sHours) || 5,
        weeklyTargetHours: 5,
        accent: sAccent,
        iconName:
          sBranch === 'sports'
            ? sAccent === 'mint'
              ? 'target'
              : 'trophy'
            : sAccent === 'mint'
            ? 'sparkles'
            : 'cpu',
        tags: sTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        milestones: [
          {
            id: `m-${Date.now()}`,
            title:
              sBranch === 'sports'
                ? 'Primera sesión de alto ritmo registrada'
                : 'Primer proyecto práctico completado',
            unlocked: true,
            date: 'Hoy',
            badge: sBranch === 'sports' ? '⚡ Deporte' : '🧠 Skill',
          },
        ],
      });
      onClose();
    } else if (mode === 'wishlist' && wName.trim()) {
      const price = Math.max(1, parseFloat(wPrice) || 200);
      const saved = Math.min(price, Math.max(0, parseFloat(wSaved) || 0));
      onAddWishlist({
        name: wName.trim(),
        category: wCategory.trim() || wTag,
        wishlistTag: wTag,
        estimatedPrice: price,
        savedAmount: saved,
        priority: wPriority,
        link: 'https://google.com',
        notes:
          wNotes.trim() || 'Meta material priorizada en el presupuesto mensual.',
        accent: wPriority === 'Alta' ? 'mint' : 'lavender',
        artVariant:
          wTag === 'Deporte / Básquet & Fútbol'
            ? 'rpg'
            : wTag === 'Setup'
            ? 'display'
            : 'keyboard',
      });
      onClose();
    } else if (mode === 'schedule' && cTitle.trim()) {
      onAddSchedule({
        title: cTitle.trim(),
        time: cTime.trim() || '17:00 - 18:00',
        dayOfMonth: Math.min(31, Math.max(1, parseInt(cDay, 10) || 27)),
        completion: 0,
        category: 'Deep Work',
        accent: cAccent,
        syncedSource: 'Google Calendar',
      });
      onClose();
    }
  };

  const modalTitle =
    mode === 'vault'
      ? editingVaultItem
        ? 'Editar en Bóveda'
        : 'Registrar en Bóveda'
      : mode === 'skill'
      ? 'Nueva Habilidad RPG'
      : mode === 'wishlist'
      ? 'Añadir Meta a Wishlist'
      : 'Agendar en Cronograma';

  const currentRatingNum = parseFloat(vRating) || 9.5;
  const computedTierPreview: VaultTier =
    currentRatingNum >= 9 ? 'S' : currentRatingNum >= 7.8 ? 'A' : 'B';

  const liveReleaseStatus = computeReleaseCountdown(
    vReleaseIsoDate || vReleaseDate
  );

  const renderLiveAutocompleteField = (placeholderText: string) => (
    <div className="relative">
      <Search className="w-4 h-4 text-[#8E95A2] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={magicQuery}
        onFocus={() => {
          if (magicResults.length > 0) setShowDropdown(true);
        }}
        onChange={(e) => setMagicQuery(e.target.value)}
        placeholder={placeholderText}
        className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.84rem] text-[#141519] placeholder:text-[#8E95A2] focus:outline-none transition-all"
      />
      {isSearchingMedia && (
        <Loader2 className="w-4 h-4 text-[#6E7480] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
      )}
      {!isSearchingMedia && magicQuery && (
        <button
          type="button"
          onClick={() => {
            setMagicQuery('');
            setMagicResults([]);
            setShowDropdown(false);
          }}
          className="w-5 h-5 rounded-full bg-[#EBF0F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {showDropdown && magicResults.length > 0 && (
        <div className="absolute left-0 right-0 top-12 bg-[#FFFFFF] rounded-2xl border border-[#EEF1F5] shadow-xl max-h-60 overflow-y-auto divide-y divide-[#EEF1F5] z-30">
          {magicResults.map((resItem) => (
            <div
              key={resItem.id}
              onClick={() => handleSelectMediaResult(resItem)}
              className="w-full p-2.5 hover:bg-[#F7F9FB] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-11 rounded-[10px] bg-[#F3F6F8] border border-[#EEF1F5] overflow-hidden shrink-0 flex items-center justify-center">
                  {resItem.imageUrl ? (
                    <img
                      src={resItem.imageUrl}
                      alt={resItem.title}
                      className="w-full h-full object-cover"
                    />
                  ) : resItem.mediaType === 'song' ||
                    resItem.mediaType === 'album' ? (
                    <Music className="w-4 h-4 text-[#6E7480]" />
                  ) : resItem.mediaType === 'video' ? (
                    <Video className="w-4 h-4 text-[#6E7480]" />
                  ) : resItem.mediaType === 'series' ||
                    resItem.mediaType === 'anime' ? (
                    <Tv className="w-4 h-4 text-[#6E7480]" />
                  ) : (
                    <Film className="w-4 h-4 text-[#6E7480]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.83rem] font-semibold text-[#141519] truncate">
                      {resItem.title}
                    </span>
                    {resItem.year && (
                      <span className="text-[0.72rem] text-[#8E95A2] shrink-0 tabular-nums">
                        ({resItem.year})
                      </span>
                    )}
                  </div>
                  <p className="text-[0.72rem] text-[#6E7480] truncate">
                    {resItem.creator}
                    {vGroup === 'proximamente' && resItem.releaseDate
                      ? ` · ${resItem.releaseDate}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {vGroup === 'proximamente' ? (
                  resItem.isFutureRelease ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.66rem] font-bold tabular-nums">
                      ⏳ Faltan {resItem.daysRemaining}d
                    </span>
                  ) : resItem.isPastRelease ? (
                    <span className="px-2 py-0.5 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[#6E7480] text-[0.65rem] font-semibold">
                      Ya estrenada
                    </span>
                  ) : null
                ) : (
                  resItem.imdbRating && (
                    <span className="px-2 py-0.5 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[#141519] text-[0.68rem] font-semibold tabular-nums">
                      {resItem.imdbRating} ★
                    </span>
                  )
                )}

                {onPreviewSearchResult && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewSearchResult(resItem, (selected, targetGroup) => {
                        if (targetGroup && targetGroup !== vGroup) {
                          setVGroup(targetGroup);
                        }
                        handleSelectMediaResult(selected);
                      });
                    }}
                    title="Vista previa interactiva (Póster, sinopsis, director y reparto)"
                    className="h-7 px-2.5 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.68rem] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Eye className="w-3 h-3 text-[#A8E6E3]" />
                    <span>Ficha</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/35 backdrop-blur-xs">
      <div className="w-full max-w-[540px] bg-[#FFFFFF] rounded-[28px] border border-[#EEF1F5] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Clean Minimal Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#EEF1F5] flex items-center justify-between shrink-0 bg-[#FFFFFF]">
          <h3 className="text-[1.1rem] font-bold text-[#141519] tracking-tight">
            {modalTitle}
          </h3>
          <button
            type="button"
            onClick={() => {
              stopModalAudio();
              onClose();
            }}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {mode === 'vault' && (
            <>
              {/* Píldoras de Categoría Superiores */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'peliculas_series', label: '🎬 Películas & Series' },
                    { id: 'proximamente', label: '⏳ Próximamente' },
                    { id: 'musica', label: '🎵 Música' },
                    { id: 'videos', label: '▶️ Videos & Canales' },
                    { id: 'personas', label: '👥 Personas' },
                    { id: 'momentos', label: '✨ Momentos / Otros' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (vGroup !== tab.id) {
                        setVGroup(tab.id);
                        if (!editingVaultItem) {
                          resetCategoryFields(tab.id);
                        } else {
                          stopModalAudio();
                          setShowDropdown(false);
                        }
                      }
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[0.75rem] font-semibold transition-all cursor-pointer ${
                      vGroup === tab.id
                        ? 'bg-[#141519] text-white shadow-2xs'
                        : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Contenedor Dinámico con Transición Fluida al Cambiar de Categoría */}
              <div key={vGroup} className="space-y-3.5 animate-vault-tab-fade">
                {/* ==========================================================
                    1. 🎬 PELÍCULAS & SERIES (VISTAS)
                ========================================================== */}
                {vGroup === 'peliculas_series' && (
                  <>
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Buscador TMDB / IMDb
                      </label>
                      {renderLiveAutocompleteField(
                        'Buscar película o serie vista (autocompleta póster, director e IMDb)...'
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-3 items-start">
                      {vImageUrl && (
                        <div className="col-span-2">
                          <div className="w-full aspect-2/3 rounded-2xl overflow-hidden border border-[#EEF1F5] bg-[#F7F9FB]">
                            <img
                              src={vImageUrl}
                              alt={vTitle}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}

                      <div className={vImageUrl ? 'col-span-6' : 'col-span-8'}>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Título
                        </label>
                        <input
                          type="text"
                          required
                          value={vTitle}
                          onChange={(e) => setVTitle(e.target.value)}
                          placeholder="Ej: Interstellar, Severance..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>

                      <div className="col-span-4">
                        <label className="flex items-center justify-between text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          <span>Tu Calificación</span>
                          <span className="px-2 py-0.5 rounded-full bg-[#141519] text-white text-[0.65rem] font-bold">
                            Tier {computedTierPreview}
                          </span>
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="10"
                          value={vRating}
                          onChange={(e) => setVRating(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] font-semibold text-[#141519] tabular-nums focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Director / Creador
                        </label>
                        <input
                          type="text"
                          value={vCreator}
                          onChange={(e) => setVCreator(e.target.value)}
                          placeholder="Ej: Christopher Nolan, Denis Villeneuve"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Género / Tags
                        </label>
                        <input
                          type="text"
                          value={vTags}
                          onChange={(e) => setVTags(e.target.value)}
                          placeholder="Sci-Fi, Thriller, Obra Maestra"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Nota o Reseña personal
                      </label>
                      <textarea
                        rows={3}
                        value={vReview}
                        onChange={(e) => setVReview(e.target.value)}
                        placeholder="¿Qué te hizo sentir o por qué merece estar en tu Bóveda?"
                        className="w-full p-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </>
                )}

                {/* ==========================================================
                    2. ⏳ PRÓXIMAMENTE (HYPE RADAR)
                ========================================================== */}
                {vGroup === 'proximamente' && (
                  <>
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Buscador de Estrenos
                      </label>
                      {renderLiveAutocompleteField(
                        'Buscar próxima película, serie o nueva temporada...'
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {vImageUrl && (
                        <div className="w-12 h-16 rounded-2xl overflow-hidden border border-[#EEF1F5] bg-[#F7F9FB] shrink-0">
                          <img
                            src={vImageUrl}
                            alt={vTitle}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[0.75rem] font-semibold text-[#6E7480]">
                            Título del Estreno
                          </label>
                          {liveReleaseStatus.isFuture && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#BBC6F8]/50 text-[#141519] keep-dark-text text-[0.65rem] font-bold">
                              ⏳ Próximamente · En Espera
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={vTitle}
                          onChange={(e) => setVTitle(e.target.value)}
                          placeholder="Ej: Dune: Messiah, The Batman Part II..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center justify-between text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Fecha de Estreno Oficial</span>
                          </span>
                          {liveReleaseStatus.isFuture ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#141519] text-white text-[0.65rem] font-bold tabular-nums">
                              Faltan {liveReleaseStatus.daysRemaining} días
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-[#F28B82]/25 text-[#141519] keep-dark-text text-[0.65rem] font-bold">
                              Estreno pasado
                            </span>
                          )}
                        </label>
                        <input
                          type="date"
                          value={vReleaseIsoDate}
                          onChange={(e) =>
                            handleReleaseDatePickerChange(e.target.value)
                          }
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.84rem] text-[#141519] tabular-nums focus:outline-none transition-all"
                        />
                        {hasManualDateOverride && (
                          <span className="block mt-1 text-[0.67rem] font-medium text-[#6E7480]">
                            Fecha ajustada manualmente ({liveReleaseStatus.formattedDate})
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Plataforma o Cine donde se estrena
                        </label>
                        <input
                          type="text"
                          value={vReleaseFormat}
                          onChange={(e) => setVReleaseFormat(e.target.value)}
                          placeholder="Cine / IMAX, Netflix, HBO Max, Apple TV+..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Alerta sutil si la fecha de estreno ya pasó */}
                    {liveReleaseStatus.isPast && (
                      <div className="p-3.5 rounded-2xl bg-[#F7F9FB] border border-[#BBC6F8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.76rem] font-bold text-[#141519]">
                            Esta fecha de estreno ({liveReleaseStatus.formattedDate}) ya pasó
                          </p>
                          <p className="text-[0.7rem] font-medium text-[#6E7480] mt-0.5">
                            Si ya se estrenó, puedes moverla a Películas & Series Vistas o elegir manualmente una fecha futura arriba.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleMoveUpcomingToWatched}
                          className="px-3.5 py-2 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.71rem] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        >
                          Mover a Películas Vistas →
                        </button>
                      </div>
                    )}

                    {/* Chips rápidos de plataforma/cine */}
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Cine / IMAX',
                        'Netflix',
                        'HBO Max',
                        'Apple TV+',
                        'Prime Video',
                        'Disney+',
                      ].map((plat) => (
                        <button
                          key={plat}
                          type="button"
                          onClick={() => setVReleaseFormat(plat)}
                          className={`px-3 py-1 rounded-full text-[0.7rem] font-semibold transition-colors cursor-pointer ${
                            vReleaseFormat === plat
                              ? 'bg-[#BBC6F8] text-[#141519] keep-dark-text font-bold'
                              : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                          }`}
                        >
                          {plat}
                        </button>
                      ))}
                    </div>

                    {/* Nivel de Hype (barra interactiva 0-100%) */}
                    <div className="p-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[0.76rem] font-semibold text-[#141519]">
                          Nivel de Hype
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-white text-[0.72rem] font-bold tabular-nums">
                          {vHypeLevel}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={vHypeLevel}
                        onChange={(e) => setVHypeLevel(e.target.value)}
                        className="w-full accent-[#141519] cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* ==========================================================
                    3. 🎵 MÚSICA (SPOTIFY)
                ========================================================== */}
                {vGroup === 'musica' && (
                  <>
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Buscador Oficial de Spotify
                      </label>
                      {renderLiveAutocompleteField(
                        'Buscar canción o álbum en Spotify (autocompleta carátula y audio 30s)...'
                      )}
                    </div>

                    <div className="flex items-center gap-3.5">
                      <div className="w-16 h-16 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] overflow-hidden shrink-0 flex items-center justify-center">
                        {vImageUrl ? (
                          <img
                            src={vImageUrl}
                            alt={vTitle || 'Carátula'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="w-6 h-6 text-[#8E95A2]" />
                        )}
                      </div>

                      <div className="flex-1">
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Título de la canción o álbum
                        </label>
                        <input
                          type="text"
                          required
                          value={vTitle}
                          onChange={(e) => setVTitle(e.target.value)}
                          placeholder="Ej: Random Access Memories, Midnight City..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Artista
                        </label>
                        <input
                          type="text"
                          value={vCreator}
                          onChange={(e) => setVCreator(e.target.value)}
                          placeholder="Ej: Daft Punk, The Weeknd, Tame Impala"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Género / Vibra
                        </label>
                        <input
                          type="text"
                          value={vTags}
                          onChange={(e) => setVTags(e.target.value)}
                          placeholder="Synthwave, Focus, Nocturno"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Enlace directo a Spotify + Botón de Vista Previa 30s */}
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Enlace directo a Spotify y Vista Previa (30s)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={vVideoUrl}
                          onChange={(e) => setVVideoUrl(e.target.value)}
                          placeholder="https://open.spotify.com/track/..."
                          className="flex-1 h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.83rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />

                        <button
                          type="button"
                          onClick={handleToggleModalAudioPreview}
                          disabled={isResolvingModalPreview || !vTitle.trim()}
                          className={`h-11 px-4 rounded-2xl text-[0.76rem] font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-50 ${
                            isPlayingModalPreview
                              ? 'bg-[#1DB954] text-[#141519] keep-dark-text'
                              : 'bg-[#141519] hover:bg-[#2A2C34] text-white'
                          }`}
                        >
                          {isResolvingModalPreview ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isPlayingModalPreview ? (
                            <>
                              <Pause className="w-3.5 h-3.5 fill-current" />
                              <ModalAudioWave active={isPlayingModalPreview} />
                              <span>Pausa</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Probar 30s</span>
                            </>
                          )}
                        </button>

                        {vVideoUrl.trim() && (
                          <a
                            href={vVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir en Spotify"
                            className="h-11 w-11 rounded-2xl bg-[#1DB954]/15 hover:bg-[#1DB954]/25 text-[#141519] flex items-center justify-center shrink-0 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-4">
                        <label className="flex items-center justify-between text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          <span>Calificación</span>
                          <span className="px-2 py-0.5 rounded-full bg-[#141519] text-white text-[0.65rem] font-bold">
                            Tier {computedTierPreview}
                          </span>
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="10"
                          value={vRating}
                          onChange={(e) => setVRating(e.target.value)}
                          className="w-full h-11 px-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] font-semibold text-[#141519] tabular-nums focus:outline-none transition-all"
                        />
                      </div>

                      <div className="col-span-8">
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Nota o reseña personal
                        </label>
                        <input
                          type="text"
                          value={vReview}
                          onChange={(e) => setVReview(e.target.value)}
                          placeholder="¿En qué momento o mood escuchas este álbum/track?"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ==========================================================
                    4. ▶️ VIDEOS & CANALES (YOUTUBE)
                ========================================================== */}
                {vGroup === 'videos' && (
                  <>
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        URL de YouTube (autocompleta miniatura y autor)
                      </label>
                      <input
                        type="url"
                        value={vVideoUrl}
                        onChange={(e) => handleVideoUrlChange(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.84rem] text-[#141519] placeholder:text-[#8E95A2] focus:outline-none transition-all"
                      />
                    </div>

                    {vImageUrl && (
                      <div className="p-2.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] flex items-center gap-3">
                        <div className="w-24 aspect-video rounded-xl overflow-hidden bg-[#EBF0F5] shrink-0 border border-white">
                          <img
                            src={vImageUrl}
                            alt={vTitle || 'Miniatura YouTube'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.8rem] font-bold text-[#141519] truncate">
                            {vTitle || 'Video detectado'}
                          </p>
                          <p className="text-[0.72rem] font-medium text-[#6E7480] truncate">
                            {vCreator || 'YouTube'}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Título del Video
                        </label>
                        <input
                          type="text"
                          required
                          value={vTitle}
                          onChange={(e) => setVTitle(e.target.value)}
                          placeholder="Título del video, charla o ensayo"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Canal / Creador
                        </label>
                        <input
                          type="text"
                          value={vCreator}
                          onChange={(e) => setVCreator(e.target.value)}
                          placeholder="Ej: Veritasium, Fireship, MKBHD..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#141519] mb-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-[#6CD4CE]" />
                        <span>Idea principal o aprendizaje</span>
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={vKeyTakeaway}
                        onChange={(e) => setVKeyTakeaway(e.target.value)}
                        placeholder="¿Cuál fue la idea clave o enseñanza que te dejó este video?"
                        className="w-full p-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </>
                )}

                {/* ==========================================================
                    5. 👥 PERSONAS (VÍNCULOS IMPORTANTES)
                ========================================================== */}
                {vGroup === 'personas' && (
                  <>
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-full bg-mint-gradient border-2 border-[#141519] flex items-center justify-center font-bold text-[0.95rem] text-[#141519] keep-dark-text shrink-0 overflow-hidden">
                        {vImageUrl.trim() ? (
                          <img
                            src={vImageUrl}
                            alt={vTitle || 'Avatar'}
                            className="w-full h-full object-cover"
                          />
                        ) : vTitle.trim() ? (
                          vTitle
                            .trim()
                            .split(' ')
                            .filter(Boolean)
                            .map((w) => w[0]?.toUpperCase())
                            .join('')
                            .slice(0, 2)
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>

                      <div className="flex-1">
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Nombre Completo
                        </label>
                        <input
                          type="text"
                          required
                          value={vTitle}
                          onChange={(e) => setVTitle(e.target.value)}
                          placeholder="Ej: Mateo Gómez, Sofía Morales..."
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Relación o Vínculo
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            'Amigo',
                            'Referente',
                            'Equipo',
                            'Familia',
                            'Mentor',
                          ] as const
                        ).map((rel) => (
                          <button
                            key={rel}
                            type="button"
                            onClick={() => setVRelationship(rel)}
                            className={`px-3.5 py-1.5 rounded-full text-[0.74rem] font-semibold transition-all cursor-pointer ${
                              vRelationship === rel
                                ? 'bg-[#141519] text-white'
                                : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                            }`}
                          >
                            {rel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Cumpleaños (Opcional)
                        </label>
                        <input
                          type="text"
                          value={vBirthday}
                          onChange={(e) => setVBirthday(e.target.value)}
                          placeholder="Ej: 14 de Diciembre"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          Avatar o Foto (URL opcional)
                        </label>
                        <input
                          type="url"
                          value={vImageUrl}
                          onChange={(e) => setVImageUrl(e.target.value)}
                          placeholder="https://... (o usa iniciales)"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Notas clave (gustos, proyectos en común, temas de conversación)
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={vReview}
                        onChange={(e) => setVReview(e.target.value)}
                        placeholder="Ideas de regalos, libros recomendados, proyectos compartidos o momentos importantes..."
                        className="w-full p-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </>
                )}

                {/* ==========================================================
                    6. ✨ MOMENTOS / OTROS (EXPERIENCIAS Y RECUERDOS)
                ========================================================== */}
                {vGroup === 'momentos' && (
                  <>
                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Título del Momento
                      </label>
                      <input
                        type="text"
                        required
                        value={vTitle}
                        onChange={(e) => setVTitle(e.target.value)}
                        placeholder="Ej: Atardecer en Tokio, Final del torneo de básquet..."
                        className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Fecha</span>
                        </label>
                        <input
                          type="date"
                          value={vMomentDateIso}
                          onChange={(e) => setVMomentDateIso(e.target.value)}
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.84rem] text-[#141519] tabular-nums focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="flex items-center gap-1 text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Lugar</span>
                        </label>
                        <input
                          type="text"
                          value={vLocation}
                          onChange={(e) => setVLocation(e.target.value)}
                          placeholder="Ciudad, país o lugar especial"
                          className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                        Descripción o recuerdo principal
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={vReview}
                        onChange={(e) => setVReview(e.target.value)}
                        placeholder="Describe los detalles de esta experiencia o por qué quieres recordarla..."
                        className="w-full p-3.5 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] focus:bg-[#FFFFFF] text-[0.85rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {mode === 'skill' && (
            <>
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                  Rama del Proyecto de Vida RPG
                </label>
                <div className="flex gap-2">
                  {(
                    [
                      { id: 'learning', label: '🧠 Aprendizajes & Skills' },
                      { id: 'sports', label: '🏀⚽ Metas Físicas & Deporte' },
                    ] as const
                  ).map((br) => (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() => {
                        setSBranch(br.id);
                        if (br.id === 'sports') {
                          setSCategory('Deporte · Básquet & Fútbol');
                          setSTags('Triples, Resistencia, Cancha');
                        } else {
                          setSCategory('Ingeniería & Diseño');
                          setSTags('Práctica, Deep Work');
                        }
                      }}
                      className={`flex-1 py-2 px-3 rounded-full text-[0.76rem] font-semibold transition-all cursor-pointer ${
                        sBranch === br.id
                          ? 'bg-[#141519] text-white'
                          : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                      }`}
                    >
                      {br.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Nombre de la Habilidad o Meta Física
                </label>
                <input
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Ej: Básquet · Tiro de Tres / Arquitectura Go"
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={sCategory}
                    onChange={(e) => setSCategory(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                  />
                </div>
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Estilo Pastel
                  </label>
                  <select
                    value={sAccent}
                    onChange={(e) =>
                      setSAccent(e.target.value as 'mint' | 'lavender')
                    }
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                  >
                    <option value="mint">Mint Turquoise (#A8E6E3)</option>
                    <option value="lavender">
                      Lavender Periwinkle (#BBC6F8)
                    </option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Nivel Inicial
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={sLevel}
                    onChange={(e) => setSLevel(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    {sBranch === 'sports'
                      ? 'Entrenamientos / Partidos'
                      : 'Horas Invertidas'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={sHours}
                    onChange={(e) => setSHours(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
              </div>
              {sBranch === 'sports' && (
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Estadísticas Deportivas (Opcional)
                  </label>
                  <input
                    type="text"
                    value={sSportStats}
                    onChange={(e) => setSSportStats(e.target.value)}
                    placeholder="Ej: 18 Partidos · 84% Tiros Libres / 14 Goles"
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                  />
                </div>
              )}
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Tags de enfoque (separados por coma)
                </label>
                <input
                  type="text"
                  value={sTags}
                  onChange={(e) => setSTags(e.target.value)}
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                />
              </div>
            </>
          )}

          {mode === 'wishlist' && (
            <>
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
                  Etiqueta de Wishlist
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      'Tech',
                      'Deporte / Básquet & Fútbol',
                      'Setup',
                      'Caprichos',
                    ] as const
                  ).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setWTag(tag);
                        setWCategory(tag);
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.74rem] font-semibold transition-all cursor-pointer ${
                        wTag === tag
                          ? 'bg-[#141519] text-white'
                          : 'bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] border border-[#EEF1F5]'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Producto o Meta Material
                </label>
                <input
                  type="text"
                  required
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="Ej: Zapatillas Kobe 8 Protro / Lente Sony 35mm"
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Precio Estimado (USD)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={wPrice}
                    onChange={(e) => setWPrice(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Ahorrado Actual (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wSaved}
                    onChange={(e) => setWSaved(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Prioridad
                  </label>
                  <select
                    value={wPriority}
                    onChange={(e) =>
                      setWPriority(e.target.value as WishlistPriority)
                    }
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                  >
                    <option value="Alta">Alta</option>
                    <option value="Media">Media</option>
                    <option value="Capricho">Capricho</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={wCategory}
                    onChange={(e) => setWCategory(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Notas
                </label>
                <input
                  type="text"
                  value={wNotes}
                  onChange={(e) => setWNotes(e.target.value)}
                  placeholder="Especificaciones o motivo de compra..."
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                />
              </div>
            </>
          )}

          {mode === 'schedule' && (
            <>
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Actividad o Bloque (Google Calendar Sync)
                </label>
                <input
                  type="text"
                  required
                  value={cTitle}
                  onChange={(e) => setCTitle(e.target.value)}
                  placeholder="Ej: Deep Work — Shaders WebGL"
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Horario
                  </label>
                  <input
                    type="text"
                    value={cTime}
                    onChange={(e) => setCTime(e.target.value)}
                    placeholder="17:00 - 18:30"
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                    Día del Mes
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={cDay}
                    onChange={(e) => setCDay(e.target.value)}
                    className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                  Color de Cápsula
                </label>
                <select
                  value={cAccent}
                  onChange={(e) =>
                    setCAccent(e.target.value as 'mint' | 'lavender')
                  }
                  className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
                >
                  <option value="mint">Mint Turquoise (#A8E6E3)</option>
                  <option value="lavender">
                    Lavender Periwinkle (#BBC6F8)
                  </option>
                </select>
              </div>
            </>
          )}

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.82rem] font-semibold text-[#6E7480] hover:text-[#141519] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="h-10 px-6 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.82rem] font-semibold transition-colors cursor-pointer"
            >
              {mode === 'vault' && editingVaultItem
                ? 'Actualizar cambios'
                : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
