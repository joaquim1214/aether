import React, { useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Film,
  Hourglass,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  VaultCategory,
  VaultFilterId,
  VaultItem,
  VaultTier,
} from '../types/lifeOs';
import {
  getAccurateHypeCountdown,
  MediaSearchResult,
} from '../services/mediaSearchService';
import { VisualArtwork } from './VisualArtwork';

export interface AnchorRectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MediaPreviewModalProps {
  vaultItem?: VaultItem | null;
  searchResult?: MediaSearchResult | null;
  triggerMode?: 'hover' | 'click';
  anchorRect?: AnchorRectLike | null;
  onHoverEnterModal?: () => void;
  onHoverLeaveModal?: () => void;
  onPinModal?: () => void;
  onClose: () => void;
  onUpdateVaultItem?: (updated: VaultItem) => Promise<void> | void;
  onEditFullVaultItem?: (item: VaultItem) => void;
  onDeleteVaultItem?: (item: VaultItem) => void;
  onSelectSearchResult?: (
    item: MediaSearchResult,
    targetGroup?: Exclude<VaultFilterId, 'todo'>
  ) => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  vaultItem,
  searchResult,
  triggerMode = 'click',
  anchorRect = null,
  onClose,
  onUpdateVaultItem,
  onEditFullVaultItem,
  onDeleteVaultItem,
  onSelectSearchResult,
}) => {
  const hasIncomingData = Boolean(vaultItem || searchResult);

  // Keep a snapshot of the last active item so the 0.2s ease-in-out exit animation can play smoothly
  const [renderedData, setRenderedData] = useState<{
    vaultItem?: VaultItem | null;
    searchResult?: MediaSearchResult | null;
    triggerMode: 'hover' | 'click';
    anchorRect?: AnchorRectLike | null;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Quick-edit state for saved VaultItems (only in click/tap modal mode)
  const [isQuickEditing, setIsQuickEditing] = useState(false);
  const [quickRating, setQuickRating] = useState<string>('9.5');
  const [quickTier, setQuickTier] = useState<VaultTier>('S');
  const [quickReview, setQuickReview] = useState<string>('');
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false);

  useEffect(() => {
    if (hasIncomingData) {
      setRenderedData({
        vaultItem,
        searchResult,
        triggerMode,
        anchorRect,
      });
      const raf = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = window.setTimeout(() => {
        setRenderedData(null);
      }, 200);
      return () => window.clearTimeout(timer);
    }
  }, [hasIncomingData, vaultItem, searchResult, triggerMode, anchorRect]);

  const activeVaultItem = vaultItem ?? renderedData?.vaultItem ?? null;
  const activeSearchResult = searchResult ?? renderedData?.searchResult ?? null;
  const activeTriggerMode = hasIncomingData
    ? triggerMode
    : renderedData?.triggerMode || 'click';
  const activeAnchorRect = hasIncomingData
    ? anchorRect
    : renderedData?.anchorRect || null;

  useEffect(() => {
    if (activeVaultItem) {
      setQuickRating(String(activeVaultItem.rating ?? 9.5));
      setQuickTier(activeVaultItem.tier || 'S');
      setQuickReview(activeVaultItem.review || '');
      setIsQuickEditing(false);
    } else {
      setIsQuickEditing(false);
    }
  }, [activeVaultItem?.id, activeSearchResult?.id]);

  useEffect(() => {
    if (!hasIncomingData) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasIncomingData, onClose]);

  if (!renderedData && !hasIncomingData) return null;

  const isHoverPopover = activeTriggerMode === 'hover' && !isQuickEditing;

  const title =
    activeVaultItem?.title || activeSearchResult?.title || 'Sin título';
  const creator =
    activeVaultItem?.creator ||
    activeSearchResult?.creator ||
    'Director / Creador';
  const year =
    activeVaultItem?.releaseYear ||
    activeSearchResult?.year ||
    (activeVaultItem?.releaseDate
      ? activeVaultItem.releaseDate.match(/\b(19|20)\d{2}\b/)?.[0]
      : undefined) ||
    '';
  const imageUrl = activeVaultItem?.imageUrl || activeSearchResult?.imageUrl;
  const imdbId = activeVaultItem?.imdbId || activeSearchResult?.imdbId;
  const imdbRating =
    activeVaultItem?.imdbRating || activeSearchResult?.imdbRating;
  const imdbVotes = activeVaultItem?.imdbVotes || activeSearchResult?.imdbVotes;
  const actors = activeVaultItem?.actors || activeSearchResult?.actors;
  const plot =
    activeVaultItem?.plot ||
    activeSearchResult?.plot ||
    activeSearchResult?.overview ||
    (activeSearchResult ? '' : activeVaultItem?.review);
  const personalReview = activeVaultItem?.review || '';
  const tags = activeVaultItem?.tags || activeSearchResult?.tags || [];
  const categoryLabel =
    activeVaultItem?.category ||
    (activeSearchResult?.mediaType === 'series'
      ? 'Serie'
      : activeSearchResult?.mediaType === 'song' ||
        activeSearchResult?.mediaType === 'album'
      ? 'Música'
      : activeSearchResult?.mediaType === 'video'
      ? 'Video'
      : 'Cine');

  const isUpcoming =
    activeVaultItem?.vaultGroup === 'proximamente' ||
    activeSearchResult?.releaseStatus === 'upcoming' ||
    Boolean(activeSearchResult?.isFutureRelease);

  const countdown = isUpcoming
    ? getAccurateHypeCountdown(
        activeVaultItem?.releaseDate || activeSearchResult?.releaseDate,
        activeVaultItem?.daysRemaining ?? activeSearchResult?.daysRemaining
      )
    : null;

  // Smart non-intrusive positioning for Desktop Hover Popover so it never blocks the cursor
  const getHoverPopoverStyle = (): React.CSSProperties => {
    const baseTransition: React.CSSProperties = {
      transition: 'all 0.2s ease-in-out',
      opacity: isVisible ? 1 : 0,
      transform: isVisible
        ? 'scale(1) translateY(0px)'
        : 'scale(0.95) translateY(6px)',
    };

    if (typeof window === 'undefined' || !activeAnchorRect) {
      return {
        ...baseTransition,
        right: '24px',
        bottom: '24px',
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popoverWidth = 390;
    const popoverHeight = 360;
    const gap = 16;

    let left = activeAnchorRect.right + gap;
    if (left + popoverWidth > vw - 16) {
      if (activeAnchorRect.left - popoverWidth - gap >= 16) {
        left = activeAnchorRect.left - popoverWidth - gap;
      } else {
        left = Math.max(16, vw - popoverWidth - 20);
      }
    }

    let top = activeAnchorRect.top;
    if (top + popoverHeight > vh - 16) {
      top = Math.max(16, vh - popoverHeight - 20);
    }
    if (top < 16) top = 16;

    return {
      ...baseTransition,
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    };
  };

  /* ==========================================================================
     MODO 1: DESKTOP HOVER POPOVER (NO INTRUSIVO, SIN BACKDROP, CIERRE INMEDIATO)
  ========================================================================== */
  if (isHoverPopover) {
    return (
      <div
        role="tooltip"
        aria-live="polite"
        style={getHoverPopoverStyle()}
        className="soft-bento-hover-popover fixed z-[55] w-[390px] max-w-[calc(100vw-32px)] pointer-events-none bg-[#FFFFFF] rounded-[24px] border border-[#EEF1F5] shadow-[0_20px_50px_-10px_rgba(20,21,25,0.22)] overflow-hidden"
      >
        {/* Top Pastel Accent Strip */}
        <div className="px-4 py-3 bg-soft-mesh-header border-b border-[#EEF1F5] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-[9px] bg-[#141519] text-[#A8E6E3] flex items-center justify-center shrink-0">
              <Film className="w-3.5 h-3.5" />
            </span>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#6E7480] truncate">
              {categoryLabel}
              {year ? ` · ${year}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {imdbRating && (
              <span className="px-2 py-0.5 rounded-full bg-[#F5C518] text-[#141519] keep-dark-text text-[0.65rem] font-extrabold tabular-nums">
                IMDb {imdbRating} ★
              </span>
            )}
            {activeVaultItem && activeVaultItem.vaultGroup !== 'proximamente' && (
              <span className="px-2 py-0.5 rounded-full bg-[#141519] text-white text-[0.66rem] font-bold tabular-nums">
                {activeVaultItem.rating.toFixed(1)} ★ · Tier{' '}
                {activeVaultItem.tier}
              </span>
            )}
            {isUpcoming && countdown && (
              <span className="px-2 py-0.5 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.66rem] font-bold tabular-nums">
                {countdown.daysRemaining === 0
                  ? '¡Hoy!'
                  : `Faltan ${countdown.daysRemaining}d`}
              </span>
            )}
          </div>
        </div>

        {/* Compact Popover Content */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3.5">
            <div className="w-20 h-28 rounded-[14px] overflow-hidden border border-[#EEF1F5] bg-[#F3F6F8] shrink-0 shadow-2xs">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <VisualArtwork
                  variant={activeVaultItem?.artVariant || 'cinema'}
                  className="w-full h-full"
                />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="text-[0.98rem] font-bold text-[#141519] leading-snug line-clamp-2">
                {title}
              </h4>
              <p className="text-[0.74rem] font-semibold text-[#6E7480] truncate">
                Dir. / Autor: <strong className="text-[#141519]">{creator}</strong>
              </p>

              {actors && (
                <p className="text-[0.7rem] font-medium text-[#6E7480] line-clamp-1">
                  👥 {actors}
                </p>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="px-2 py-0.5 rounded-full bg-[#F3F6F8] border border-[#EEF1F5] text-[0.64rem] font-semibold text-[#141519]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {plot && (
            <div className="p-3 rounded-[14px] bg-[#F7F9FB] border border-[#EEF1F5]">
              <p className="text-[0.75rem] font-medium text-[#141519] leading-relaxed line-clamp-3">
                {plot}
              </p>
            </div>
          )}

          {activeVaultItem &&
            personalReview &&
            personalReview !== plot && (
              <div className="px-3 py-2 rounded-[14px] bg-mint-gradient keep-dark-text border border-white/80">
                <p className="text-[0.72rem] font-semibold text-[#141519] line-clamp-2">
                  “{personalReview}”
                </p>
              </div>
            )}

          <div className="pt-1 flex items-center justify-between text-[0.66rem] font-semibold text-[#8E95A2]">
            <span>Vista previa rápida</span>
            <span className="text-[#141519] font-bold">
              Haz clic en la tarjeta para acciones
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================================
     MODO 2: MODAL COMPLETO INTERACTIVO (AL HACER CLIC EN DESKTOP O TAP EN MÓVIL)
  ========================================================================== */
  const handleSaveQuickRatingAndReview = async () => {
    if (!activeVaultItem || !onUpdateVaultItem) return;
    setIsSavingQuickEdit(true);
    try {
      const parsedRating = Math.min(
        10,
        Math.max(1, parseFloat(quickRating) || activeVaultItem.rating || 9.0)
      );
      const updated: VaultItem = {
        ...activeVaultItem,
        rating: Number(parsedRating.toFixed(1)),
        tier: quickTier,
        review: quickReview.trim() || activeVaultItem.review,
        isFeaturedMasterpiece:
          activeVaultItem.vaultGroup !== 'proximamente' && quickTier === 'S',
      };
      await onUpdateVaultItem(updated);
      setIsQuickEditing(false);
    } finally {
      setIsSavingQuickEdit(false);
    }
  };

  const handleToggleVaultStatus = async () => {
    if (!activeVaultItem || !onUpdateVaultItem) return;
    const todayFormatted = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (activeVaultItem.vaultGroup === 'proximamente') {
      const nextCategory: VaultCategory =
        activeVaultItem.releaseFormat?.toLowerCase().includes('serie')
          ? 'Serie'
          : 'Cine';
      const updated: VaultItem = {
        ...activeVaultItem,
        vaultGroup: 'peliculas_series',
        category: nextCategory,
        consumedDate: todayFormatted,
        accent: 'mint',
        rating: activeVaultItem.rating || 9.5,
        tier: activeVaultItem.tier || 'S',
        isFeaturedMasterpiece: (activeVaultItem.tier || 'S') === 'S',
      };
      await onUpdateVaultItem(updated);
    } else {
      const updated: VaultItem = {
        ...activeVaultItem,
        vaultGroup: 'proximamente',
        category: 'Próximamente',
        consumedDate: 'En Espera',
        accent: 'lavender',
        releaseDate: activeVaultItem.releaseDate || 'Próximo estreno',
        daysRemaining: activeVaultItem.daysRemaining ?? 30,
        hypeLevel: activeVaultItem.hypeLevel ?? 95,
        isFeaturedMasterpiece: false,
      };
      await onUpdateVaultItem(updated);
    }
  };

  const handleToggleMasterpiece = async () => {
    if (!activeVaultItem || !onUpdateVaultItem) return;
    const updated: VaultItem = {
      ...activeVaultItem,
      isFeaturedMasterpiece: !activeVaultItem.isFeaturedMasterpiece,
      tier: !activeVaultItem.isFeaturedMasterpiece ? 'S' : activeVaultItem.tier,
    };
    await onUpdateVaultItem(updated);
  };

  return (
    <div
      style={{
        transition: 'all 0.2s ease-in-out',
        opacity: isVisible ? 1 : 0,
      }}
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#141519]/50 backdrop-blur-xs pointer-events-auto"
      onClick={() => onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          transition: 'all 0.2s ease-in-out',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.96)',
        }}
        className="w-full max-w-full sm:max-w-[680px] max-h-[92dvh] sm:max-h-[88vh] bg-[#FFFFFF] rounded-t-[28px] sm:rounded-[28px] border border-[#EEF1F5] shadow-[0_24px_60px_-12px_rgba(20,21,25,0.28)] overflow-hidden flex flex-col"
      >
        {/* Top Header Bar */}
        <div className="px-5 sm:px-6 py-4 bg-soft-mesh-header border-b border-[#EEF1F5] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-[12px] bg-[#141519] text-[#A8E6E3] flex items-center justify-center shrink-0">
              <Film className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#6E7480] block">
                {activeVaultItem
                  ? 'Ficha Interactiva de Bóveda'
                  : 'Vista Previa de Catálogo'}
              </span>
              <h3 className="text-[0.95rem] font-bold text-[#141519] truncate">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Cerrar vista previa"
            className="w-9 h-9 rounded-full bg-[#F7F9FB] hover:bg-[#141519] text-[#6E7480] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 min-h-0">
          {/* Hero Row: Poster + Main Details */}
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            {/* High-Res Poster */}
            <div className="w-44 sm:w-48 aspect-[2/3] rounded-[20px] overflow-hidden border border-[#EEF1F5] bg-[#F3F6F8] shadow-bento shrink-0 relative group">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <VisualArtwork
                  variant={activeVaultItem?.artVariant || 'cinema'}
                  className="w-full h-full"
                />
              )}

              {/* Floating Top Badge on Poster */}
              <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                {activeVaultItem &&
                  activeVaultItem.vaultGroup !== 'proximamente' && (
                    <span className="px-2.5 py-1 rounded-full bg-[#141519]/90 backdrop-blur-md text-white text-[0.7rem] font-bold flex items-center gap-1 shadow-xs">
                      <Star className="w-3 h-3 text-[#A8E6E3] fill-[#A8E6E3]" />
                      <span>
                        {activeVaultItem.rating.toFixed(1)} · Tier{' '}
                        {activeVaultItem.tier}
                      </span>
                    </span>
                  )}
                {isUpcoming && countdown && (
                  <span className="px-2.5 py-1 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.7rem] font-bold flex items-center gap-1 shadow-xs">
                    <Hourglass className="w-3 h-3" />
                    <span>
                      {countdown.daysRemaining === 0
                        ? '¡Estreno Hoy!'
                        : `Faltan ${countdown.daysRemaining}d`}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Metadata Column */}
            <div className="flex-1 min-w-0 space-y-3 text-center sm:text-left w-full">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-3 py-1 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.72rem] font-bold">
                  {categoryLabel}
                </span>

                {year && (
                  <span className="px-2.5 py-1 rounded-full bg-[#F3F6F8] border border-[#EEF1F5] text-[#141519] text-[0.72rem] font-bold tabular-nums">
                    {year}
                  </span>
                )}

                {imdbRating && (
                  <a
                    href={
                      imdbId
                        ? `https://www.imdb.com/title/${imdbId}`
                        : `https://www.imdb.com/find/?q=${encodeURIComponent(
                            title
                          )}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-full bg-[#F5C518]/25 hover:bg-[#F5C518]/40 border border-[#F5C518]/50 text-[#141519] text-[0.72rem] font-bold inline-flex items-center gap-1 transition-colors"
                  >
                    <Star className="w-3 h-3 fill-[#141519] text-[#141519]" />
                    <span>IMDb {imdbRating}</span>
                    {imdbVotes && (
                      <span className="text-[#6E7480] font-medium">
                        ({imdbVotes})
                      </span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                  </a>
                )}

                {activeVaultItem?.isFeaturedMasterpiece && (
                  <span className="px-2.5 py-1 rounded-full bg-[#141519] text-[#A8E6E3] text-[0.7rem] font-bold inline-flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    <span>Obra Maestra</span>
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#141519] tracking-[-0.02em] leading-tight">
                  {title}
                </h2>
                <p className="text-[0.84rem] font-semibold text-[#6E7480] mt-1 flex items-center justify-center sm:justify-start gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#141519] shrink-0" />
                  <span>Dirección / Autor:</span>
                  <span className="text-[#141519] font-bold">{creator}</span>
                </p>
              </div>

              {actors && (
                <div className="p-3 rounded-[16px] bg-[#F7F9FB] border border-[#EEF1F5] text-left">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8E95A2] flex items-center gap-1.5 mb-0.5">
                    <Users className="w-3.5 h-3.5 text-[#141519]" />
                    <span>Reparto Principal</span>
                  </p>
                  <p className="text-[0.8rem] font-semibold text-[#141519] leading-snug">
                    {actors}
                  </p>
                </div>
              )}

              {/* Date / Release Info */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[0.75rem] font-semibold text-[#6E7480]">
                {isUpcoming && countdown ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#BBC6F8]/35 text-[#141519]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Estreno: {countdown.formattedDate}</span>
                  </span>
                ) : activeVaultItem?.consumedDate ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[#6E7480]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Registrado: {activeVaultItem.consumedDate}</span>
                  </span>
                ) : null}

                {activeVaultItem?.releaseFormat && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[#141519]">
                    <span>{activeVaultItem.releaseFormat}</span>
                  </span>
                )}
              </div>

              {/* Tags Row */}
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                  {tags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className="px-2.5 py-1 rounded-full bg-[#F3F6F8] border border-[#EEF1F5] text-[0.72rem] font-semibold text-[#141519]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Synopsis & Personal Review Bento Blocks */}
          <div className="space-y-3">
            {plot && (
              <div className="p-4 rounded-[20px] bg-[#F7F9FB] border border-[#EEF1F5]">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#6E7480] block mb-1">
                  Sinopsis
                </span>
                <p className="text-[0.83rem] font-medium text-[#141519] leading-relaxed">
                  {plot}
                </p>
              </div>
            )}

            {activeVaultItem &&
              personalReview &&
              personalReview !== plot &&
              !isQuickEditing && (
                <div className="p-4 rounded-[20px] bg-mint-gradient keep-dark-text border border-white/80">
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#141519]/75 block mb-1">
                    Tu Reseña / Nota Personal
                  </span>
                  <p className="text-[0.83rem] font-semibold text-[#141519] leading-relaxed">
                    “{personalReview}”
                  </p>
                </div>
              )}
          </div>

          {/* Inline Quick Edit Form (for saved VaultItem) */}
          {activeVaultItem && isQuickEditing && (
            <div className="p-4 rounded-[22px] bg-[#F3F6F8] border border-[#141519]/15 space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[0.78rem] font-bold text-[#141519] flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar Calificación, Tier y Reseña</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuickEditing(false)}
                  className="text-[0.72rem] font-semibold text-[#6E7480] hover:text-[#141519] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.72rem] font-bold text-[#6E7480] mb-1">
                    Tu Nota Personal (1.0 - 10.0)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="10"
                    value={quickRating}
                    onChange={(e) => setQuickRating(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-full bg-white border border-[#EEF1F5] text-[0.84rem] font-bold text-[#141519] focus:outline-none focus:border-[#141519]"
                  />
                </div>

                <div>
                  <label className="block text-[0.72rem] font-bold text-[#6E7480] mb-1">
                    Clasificación Tier
                  </label>
                  <div className="flex items-center gap-1.5">
                    {(['S', 'A', 'B'] as VaultTier[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setQuickTier(t)}
                        className={`flex-1 h-10 rounded-full text-[0.78rem] font-bold transition-all cursor-pointer ${
                          quickTier === t
                            ? 'bg-[#141519] text-white'
                            : 'bg-white border border-[#EEF1F5] text-[#6E7480] hover:text-[#141519]'
                        }`}
                      >
                        Tier {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[0.72rem] font-bold text-[#6E7480] mb-1">
                  Reseña o Comentario Personal
                </label>
                <textarea
                  rows={2}
                  value={quickReview}
                  onChange={(e) => setQuickReview(e.target.value)}
                  placeholder="Escribe qué te pareció esta obra..."
                  className="w-full p-3 rounded-[16px] bg-white border border-[#EEF1F5] text-[0.82rem] text-[#141519] focus:outline-none focus:border-[#141519]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingQuickEdit}
                  onClick={handleSaveQuickRatingAndReview}
                  className="h-9 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.78rem] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-[#A8E6E3]" />
                  <span>Guardar nota</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="px-5 sm:px-6 py-4 bg-[#F7F9FB] border-t border-[#EEF1F5] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {activeVaultItem ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Edit Rating/Review Button */}
                {onUpdateVaultItem && (
                  <button
                    type="button"
                    onClick={() => setIsQuickEditing((prev) => !prev)}
                    className={`h-10 px-4 rounded-full text-[0.78rem] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isQuickEditing
                        ? 'bg-[#141519] text-white'
                        : 'bg-white hover:bg-[#A8E6E3]/45 border border-[#EEF1F5] text-[#141519]'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Editar nota</span>
                  </button>
                )}

                {/* Switch State Button (Próximamente <-> Ya Vista) */}
                {onUpdateVaultItem &&
                  (activeVaultItem.vaultGroup === 'peliculas_series' ||
                    activeVaultItem.vaultGroup === 'proximamente') && (
                    <button
                      type="button"
                      onClick={handleToggleVaultStatus}
                      className="h-10 px-4 rounded-full bg-[#BBC6F8]/45 hover:bg-[#BBC6F8]/75 text-[#141519] keep-dark-text text-[0.78rem] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {activeVaultItem.vaultGroup === 'proximamente' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Marcar como Ya Vista</span>
                        </>
                      ) : (
                        <>
                          <Hourglass className="w-3.5 h-3.5" />
                          <span>Pasar a Próximamente</span>
                        </>
                      )}
                    </button>
                  )}

                {/* Toggle Masterpiece */}
                {onUpdateVaultItem &&
                  activeVaultItem.vaultGroup !== 'proximamente' && (
                    <button
                      type="button"
                      onClick={handleToggleMasterpiece}
                      className={`h-10 px-3.5 rounded-full text-[0.76rem] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeVaultItem.isFeaturedMasterpiece
                          ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text'
                          : 'bg-white hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#6E7480]'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Obra Maestra</span>
                    </button>
                  )}
              </div>

              <div className="flex items-center gap-2">
                {onEditFullVaultItem && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeVaultItem;
                      onClose();
                      onEditFullVaultItem(target);
                    }}
                    title="Abrir formulario de edición completo"
                    className="h-10 px-3.5 rounded-full bg-white hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] text-[0.76rem] font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Editar ficha</span>
                  </button>
                )}

                {onDeleteVaultItem && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeVaultItem;
                      onClose();
                      onDeleteVaultItem(target);
                    }}
                    title="Eliminar de la Bóveda"
                    className="h-10 px-3.5 rounded-full bg-[#F28B82]/20 hover:bg-[#F28B82]/40 text-[#141519] text-[0.76rem] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                )}
              </div>
            </>
          ) : activeSearchResult && onSelectSearchResult ? (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.75rem] font-medium text-[#6E7480]">
                Selecciona cómo deseas usar este resultado:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSearchResult(activeSearchResult, 'proximamente');
                    onClose();
                  }}
                  className="h-10 px-4 rounded-full bg-[#BBC6F8] hover:brightness-95 text-[#141519] keep-dark-text text-[0.78rem] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Hourglass className="w-3.5 h-3.5" />
                  <span>En Próximamente</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSearchResult(
                      activeSearchResult,
                      'peliculas_series'
                    );
                    onClose();
                  }}
                  className="h-10 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.78rem] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#A8E6E3]" />
                  <span>Seleccionar para Bóveda</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
