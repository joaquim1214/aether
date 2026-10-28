import React, { useState } from 'react';
import {
  Award,
  Bell,
  BookMarked,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  Crown,
  Download,
  Flame,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { TabId } from '../types/lifeOs';

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  category: 'calendar' | 'skills' | 'wishlist' | 'vault';
  targetTab: TabId;
}

export interface UserProfile {
  name: string;
  initials: string;
  roleTitle: string;
  email: string;
  dailyGoalHours: number;
  avatarAccent: 'lavender' | 'mint' | 'sky' | 'charcoal';
}

interface NotificationsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
  onSelectNotification: (item: NotificationItem) => void;
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAll,
  onSelectNotification,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getCategoryIcon = (cat: NotificationItem['category']) => {
    switch (cat) {
      case 'calendar':
        return <Calendar className="w-4 h-4" />;
      case 'skills':
        return <Flame className="w-4 h-4" />;
      case 'wishlist':
        return <ShoppingBag className="w-4 h-4" />;
      case 'vault':
        return <BookMarked className="w-4 h-4" />;
    }
  };

  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute right-0 top-13 z-50 w-[360px] sm:w-[400px] bg-white rounded-[26px] border border-[#EEF1F5] shadow-floating-dock overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-soft-mesh-header border-b border-[#EEF1F5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#141519]" />
            <h3 className="text-[0.95rem] font-bold text-[#141519]">
              Centro de Notificaciones
            </h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#141519] text-white text-[0.68rem] font-bold tabular-nums">
                {unreadCount} nuevas
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                title="Marcar todas como leídas"
                className="px-2.5 py-1 rounded-full bg-[#F7F9FB] hover:bg-[#A8E6E3]/60 text-[0.7rem] font-semibold text-[#141519] flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Leídas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar notificaciones"
              className="w-7 h-7 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#141519] flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-[#EEF1F5]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-[#F7F9FB] text-[#8E95A2] flex items-center justify-center mx-auto mb-2">
                <Bell className="w-4 h-4" />
              </div>
              <p className="text-[0.84rem] font-semibold text-[#141519]">
                Todo al día en tu Aether
              </p>
              <p className="text-[0.75rem] text-[#6E7480] mt-0.5">
                Las alertas de Calendar, Habilidades y Wishlist aparecerán aquí.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectNotification(item)}
                className={`p-4 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                  item.read
                    ? 'bg-white hover:bg-[#F7F9FB]'
                    : 'bg-[#F7F9FB]/90 hover:bg-[#EBF0F5]/60'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 keep-dark-text ${
                      item.category === 'skills' || item.category === 'vault'
                        ? 'bg-[#A8E6E3] text-[#141519]'
                        : 'bg-[#BBC6F8] text-[#141519]'
                    }`}
                  >
                    {getCategoryIcon(item.category)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-[#6CD4CE] shrink-0" />
                      )}
                      <p className="text-[0.82rem] font-bold text-[#141519] truncate">
                        {item.title}
                      </p>
                    </div>
                    <p className="text-[0.76rem] text-[#6E7480] leading-snug mt-0.5">
                      {item.description}
                    </p>
                    <span className="block text-[0.68rem] font-semibold text-[#8E95A2] mt-1 tabular-nums">
                      {item.time}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!item.read && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead(item.id);
                      }}
                      title="Marcar como leída"
                      className="w-7 h-7 rounded-full hover:bg-[#EBF0F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotification(item.id);
                    }}
                    title="Eliminar notificación"
                    className="w-7 h-7 rounded-full hover:bg-[#EBF0F5] text-[#8E95A2] hover:text-[#141519] flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-5 py-3 bg-[#F7F9FB] border-t border-[#EEF1F5] flex items-center justify-between">
            <span className="text-[0.72rem] font-medium text-[#6E7480]">
              Haz clic en una alerta para ir al módulo
            </span>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[0.72rem] font-semibold text-[#6E7480] hover:text-[#141519] cursor-pointer"
            >
              Limpiar todo
            </button>
          </div>
        )}
      </div>
    </>
  );
};

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaveProfile: (updated: UserProfile) => void;
  stats: {
    totalLevel: number;
    totalHours: number;
    vaultCount: number;
    wishlistCount: number;
  };
  onExportData: () => void;
  spotifyProfile?: { displayName: string; imageUrl?: string } | null;
  isConnectingSpotify?: boolean;
  onConnectSpotify?: () => void;
  onDisconnectSpotify?: () => void;
}

const MinimalSpotifyIcon: React.FC<{ className?: string }> = ({
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

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  stats,
  onExportData,
  spotifyProfile,
  isConnectingSpotify,
  onConnectSpotify,
  onDisconnectSpotify,
}) => {
  const [name, setName] = useState(profile.name);
  const [initials, setInitials] = useState(profile.initials);
  const [roleTitle, setRoleTitle] = useState(profile.roleTitle);
  const [dailyGoalHours, setDailyGoalHours] = useState(
    String(profile.dailyGoalHours)
  );
  const [avatarAccent, setAvatarAccent] = useState<UserProfile['avatarAccent']>(
    profile.avatarAccent
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      ...profile,
      name: name.trim() || 'Joaquim',
      initials: (initials.trim() || 'JQ').slice(0, 2).toUpperCase(),
      roleTitle: roleTitle.trim() || 'Creador',
      dailyGoalHours: Math.min(12, Math.max(1, parseFloat(dailyGoalHours) || 4.0)),
      avatarAccent,
    });
    onClose();
  };

  const getAvatarBg = (acc: UserProfile['avatarAccent']) => {
    if (acc === 'mint') return 'bg-mint-gradient text-[#141519] keep-dark-text';
    if (acc === 'lavender')
      return 'bg-lavender-gradient text-[#141519] keep-dark-text';
    if (acc === 'sky') return 'bg-[#CAE9F5] text-[#141519] keep-dark-text';
    return 'bg-[#141519] text-white';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/40 backdrop-blur-xs">
      <div className="w-full max-w-[480px] bg-white rounded-[32px] border border-[#EEF1F5] shadow-floating-dock overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-soft-mesh-header border-b border-[#EEF1F5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full border-2 border-white flex items-center justify-center font-bold text-[1rem] shadow-xs ${getAvatarBg(
                avatarAccent
              )}`}
            >
              {initials || 'JQ'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[1.08rem] font-bold text-[#141519]">
                  Perfil de {name || 'Joaquim'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[#CAE9F5] text-[#141519] keep-dark-text text-[0.7rem] font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3 fill-[#141519]" />
                  Lv. {stats.totalLevel}
                </span>
              </div>
              <p className="text-[0.75rem] font-medium text-[#6E7480]">
                {profile.email} · Google Calendar & Tasks Sync
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[#141519] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-3 gap-2.5 px-6 pt-5 shrink-0">
          <div className="p-3 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] text-center">
            <span className="block text-[0.68rem] font-semibold text-[#6E7480]">
              Horas Totales
            </span>
            <span className="text-[1rem] font-bold text-[#141519] tabular-nums">
              {stats.totalHours}h
            </span>
          </div>
          <div className="p-3 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] text-center">
            <span className="block text-[0.68rem] font-semibold text-[#6E7480]">
              En Bóveda
            </span>
            <span className="text-[1rem] font-bold text-[#141519] tabular-nums">
              {stats.vaultCount} obras
            </span>
          </div>
          <div className="p-3 rounded-[18px] bg-[#F7F9FB] border border-[#EEF1F5] text-center">
            <span className="block text-[0.68rem] font-semibold text-[#6E7480]">
              Wishlist
            </span>
            <span className="text-[1rem] font-bold text-[#141519] tabular-nums">
              {stats.wishlistCount} metas
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                Nombre en Saludo Principal
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                Iniciales Avatar
              </label>
              <input
                type="text"
                maxLength={2}
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] uppercase text-center font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                Rango / Título RPG
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="Ej: Creador, Arquitecto"
                className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519]"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1">
                Meta Diaria (Horas)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="12"
                value={dailyGoalHours}
                onChange={(e) => setDailyGoalHours(e.target.value)}
                className="w-full h-10 px-4 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.85rem] text-[#141519] tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[0.75rem] font-semibold text-[#6E7480] mb-1.5">
              Color de Insignia de Avatar
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'lavender', label: 'Lavender' },
                  { id: 'mint', label: 'Mint' },
                  { id: 'sky', label: 'Sky Pastel' },
                  { id: 'charcoal', label: 'Charcoal' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAvatarAccent(opt.id)}
                  className={`h-9 rounded-full text-[0.75rem] font-semibold border transition-all cursor-pointer ${
                    avatarAccent === opt.id
                      ? 'border-[#141519] ring-2 ring-[#A8E6E3] font-bold'
                      : 'border-[#EEF1F5] opacity-80 hover:opacity-100'
                  } ${getAvatarBg(opt.id)}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Integración Oficial con Spotify (OAuth 2.0 PKCE) */}
          <div className="p-3.5 rounded-[20px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#1DB954]/15 text-[#1DB954] flex items-center justify-center shrink-0">
                <MinimalSpotifyIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.8rem] font-bold text-[#141519] truncate">
                  {spotifyProfile
                    ? `Spotify · ${spotifyProfile.displayName}`
                    : 'Spotify Oficial'}
                </p>
                <p className="text-[0.7rem] font-medium text-[#6E7480] truncate">
                  {spotifyProfile
                    ? 'Sincronizado con Playlists y Bóveda'
                    : 'Importa tus playlists y álbumes'}
                </p>
              </div>
            </div>

            {spotifyProfile ? (
              <button
                type="button"
                onClick={onDisconnectSpotify}
                className="h-8 px-3.5 rounded-full bg-[#FFFFFF] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.74rem] font-semibold text-[#6E7480] hover:text-[#141519] transition-colors cursor-pointer shrink-0"
              >
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectSpotify}
                disabled={isConnectingSpotify}
                className="h-9 px-4 rounded-full bg-[#1DB954] hover:bg-[#1aa34a] text-[#141519] keep-dark-text text-[0.76rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs disabled:opacity-60"
              >
                <MinimalSpotifyIcon className="w-4 h-4" />
                <span>
                  {isConnectingSpotify
                    ? 'Conectando...'
                    : 'Conectar con Spotify'}
                </span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#EEF1F5] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onExportData}
              className="h-10 px-4 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.78rem] font-semibold text-[#141519] flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Backup JSON</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[0.8rem] font-semibold text-[#6E7480] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold cursor-pointer"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
