import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BookMarked,
  Calendar as CalendarIcon,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  Cloud,
  Compass,
  Crown,
  Film,
  Flame,
  LayoutGrid,
  LogOut,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  buildMonthCalendarMatrix,
  INITIAL_ACTIVITY,
  INITIAL_CALENDAR_MATRIX,
  INITIAL_SCHEDULE,
  INITIAL_SKILLS,
  INITIAL_VAULT,
  INITIAL_WISHLIST,
} from './data/initialData';
import {
  AssistantActionRecord,
  AssistantConversation,
  CalendarDay,
  DailyActivity,
  GoogleTaskItem,
  ScheduleBlock,
  SkillItem,
  TabId,
  VaultCategory,
  VaultFilterId,
  VaultItem,
  VaultTier,
  WishlistItem,
  WishlistPriority,
} from './types/lifeOs';
import {
  BentoHeader,
  CalendarMatrix,
  PastelSkillCard,
  SoftBentoEmptyState,
  TimelineSchedule,
} from './components/BentoPrimitives';
import { VisualArtwork } from './components/VisualArtwork';
import {
  CalendarView,
  SkillsView,
  VaultView,
  WishlistView,
} from './components/ModuleViews';
import { GeminiActionHub } from './components/GeminiActionHub';
import { QuickCreateModal } from './components/QuickCreateModal';
import {
  NotificationItem,
  NotificationsPopover,
  UserProfile,
  UserProfileModal,
} from './components/TopBarPopovers';
import {
  createSkillRpgDoc,
  createVaultItemDoc,
  createWishlistItemDoc,
  deleteAssistantConversationDoc,
  deleteSkillRpgDoc,
  deleteVaultItemDoc,
  deleteWishlistItemDoc,
  getAccessToken,
  googleSignInWithWorkspace,
  initAuth,
  logoutFirebase,
  saveAssistantConversationDoc,
  saveWishlistSettingsDoc,
  subscribeAssistantConversations,
  subscribeDailyHours,
  subscribeSkillsRpg,
  subscribeVaultItems,
  subscribeWishlistItems,
  subscribeWishlistSettings,
  updateSkillRpgDoc,
  updateVaultItemDoc,
  updateWishlistItemDoc,
  upsertDailyHoursDoc,
} from './services/firebase';
import {
  buildEventIsoRange,
  createGoogleCalendarEvent,
  createGoogleTaskItem,
  deleteGoogleCalendarEvent,
  deleteGoogleTaskItem,
  fetchGoogleCalendarEvents,
  fetchGoogleTasks,
  updateGoogleTaskStatus,
} from './services/googleWorkspace';
import {
  computeReleaseCountdown,
  findBestMediaMatch,
  getAccurateHypeCountdown,
} from './services/mediaSearchService';
import {
  completeSpotifyPkceHandshake,
  disconnectSpotify,
  getSpotifyStoredProfile,
  setStoredSpotifyClientId,
  startSpotifyPkcePopup,
} from './services/spotifyService';

interface PendingDeleteRequest {
  title: string;
  subtitle: string;
  onConfirm: () => Promise<void>;
}

const LS_KEYS = {
  vault: 'lifeos_prod_vault_v1',
  skills: 'lifeos_prod_skills_v1',
  wishlist: 'lifeos_prod_wishlist_v1',
  savingsPool: 'lifeos_prod_savings_pool_v1',
  schedule: 'lifeos_prod_schedule_v1',
  tasks: 'lifeos_prod_tasks_v1',
  activity: 'lifeos_prod_activity_v1',
  conversations: 'lifeos_prod_conversations_v1',
};

function readLocalBackup<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseHashToTab(rawHash: string): TabId {
  const cleaned = rawHash.replace(/^#\/?/, '').trim().toLowerCase();
  if (cleaned === 'vault' || cleaned === 'boveda') return 'vault';
  if (cleaned === 'skills' || cleaned === 'habilidades') return 'skills';
  if (cleaned === 'wishlist') return 'wishlist';
  if (cleaned === 'calendar' || cleaned === 'calendario') return 'calendar';
  return 'dashboard';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    typeof window !== 'undefined'
      ? parseHashToTab(window.location.hash)
      : 'dashboard'
  );
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isDailyBriefExpanded, setIsDailyBriefExpanded] = useState(false);

  // Hash-based routing synchronization for static hosting (GitHub Pages)
  useEffect(() => {
    const targetHash = `#/${activeTab}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextTab = parseHashToTab(window.location.hash);
      setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Firebase Auth & Google Workspace OAuth 2.0 state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);

  // Spotify Official OAuth 2.0 PKCE state
  const [spotifyProfile, setSpotifyProfile] = useState<{
    displayName: string;
    imageUrl?: string;
  } | null>(() => getSpotifyStoredProfile());
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isSpotifyClientModalOpen, setIsSpotifyClientModalOpen] =
    useState(false);
  const [spotifyClientIdInput, setSpotifyClientIdInput] = useState('');

  // Theme & Top-Right Controls State
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('lifeos_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Joaquim',
    initials: 'JQ',
    roleTitle: 'Creador',
    email: 'joaquim.egas1214@gmail.com',
    dailyGoalHours: 4.0,
    avatarAccent: 'lavender',
  });

  const [createModalMode, setCreateModalMode] = useState<
    'vault' | 'skill' | 'wishlist' | 'schedule' | null
  >(null);
  const [editingVaultItem, setEditingVaultItem] = useState<VaultItem | null>(
    null
  );
  const [defaultVaultGroup, setDefaultVaultGroup] = useState<
    Exclude<VaultFilterId, 'todo'>
  >('peliculas_series');
  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<PendingDeleteRequest | null>(null);

  // ==========================================================================
  // ZERO MOCK DATA: Clean initial arrays fed by Firestore & Google APIs
  // ==========================================================================
  const todayDateNum = new Date().getDate();
  const [skills, setSkills] = useState<SkillItem[]>(() =>
    readLocalBackup(LS_KEYS.skills, INITIAL_SKILLS)
  );
  const [activity, setActivity] = useState<DailyActivity[]>(() =>
    readLocalBackup(LS_KEYS.activity, INITIAL_ACTIVITY)
  );
  const [vault, setVault] = useState<VaultItem[]>(() =>
    readLocalBackup(LS_KEYS.vault, INITIAL_VAULT)
  );
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() =>
    readLocalBackup(LS_KEYS.wishlist, INITIAL_WISHLIST)
  );
  const [extraSavingsPool, setExtraSavingsPool] = useState<number>(() =>
    readLocalBackup(LS_KEYS.savingsPool, 0)
  );
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>(
    INITIAL_CALENDAR_MATRIX
  );
  const [selectedCalendarDay, setSelectedCalendarDay] =
    useState<number>(todayDateNum);
  const [selectedMonth, setSelectedMonth] = useState<string>('Octubre');
  const [vaultMiniSearch, setVaultMiniSearch] = useState<string>('');
  const [schedule, setSchedule] = useState<ScheduleBlock[]>(() =>
    readLocalBackup(LS_KEYS.schedule, INITIAL_SCHEDULE)
  );
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>(() =>
    readLocalBackup(LS_KEYS.tasks, [])
  );
  const [assistantConversations, setAssistantConversations] = useState<
    AssistantConversation[]
  >(() => readLocalBackup(LS_KEYS.conversations, []));

  const showNotification = useCallback((msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  const pushActivityAlert = useCallback(
    (
      title: string,
      description: string,
      category: NotificationItem['category'],
      targetTab: TabId
    ) => {
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description,
        time: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        read: false,
        category,
        targetTab,
      };
      setNotifications((prev) => [newNotif, ...prev]);
    },
    []
  );

  // Sync dark mode class with document.body
  useEffect(() => {
    try {
      localStorage.setItem('lifeos_theme', themeMode);
    } catch {
      // ignore storage errors
    }
    if (themeMode === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  }, [themeMode]);

  // Save local backup only when not authenticated with Firebase
  useEffect(() => {
    if (authUser) return;
    try {
      localStorage.setItem(LS_KEYS.vault, JSON.stringify(vault));
      localStorage.setItem(LS_KEYS.skills, JSON.stringify(skills));
      localStorage.setItem(LS_KEYS.wishlist, JSON.stringify(wishlist));
      localStorage.setItem(
        LS_KEYS.savingsPool,
        JSON.stringify(extraSavingsPool)
      );
      localStorage.setItem(LS_KEYS.schedule, JSON.stringify(schedule));
      localStorage.setItem(LS_KEYS.tasks, JSON.stringify(googleTasks));
      localStorage.setItem(LS_KEYS.activity, JSON.stringify(activity));
      localStorage.setItem(
        LS_KEYS.conversations,
        JSON.stringify(assistantConversations)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    authUser,
    vault,
    skills,
    wishlist,
    extraSavingsPool,
    schedule,
    googleTasks,
    activity,
    assistantConversations,
  ]);

  // Update Calendar Matrix highlights whenever schedule blocks or tasks change
  useEffect(() => {
    const baseMatrix = buildMonthCalendarMatrix();
    const highlighted = baseMatrix.map((day) => {
      if (!day.dayNumber) return day;
      const matchingBlocks = schedule.filter(
        (b) => b.dayOfMonth === day.dayNumber
      );
      if (matchingBlocks.length > 0) {
        const first = matchingBlocks[0];
        return {
          ...day,
          state: first.accent,
          label: matchingBlocks.map((b) => b.title).join(' · '),
        };
      }
      return day;
    });
    setCalendarDays(highlighted);
  }, [schedule]);

  // ==========================================================================
  // 1. INITIALIZE FIREBASE AUTH & REAL-TIME FIRESTORE LISTENERS (onSnapshot)
  // ==========================================================================
  useEffect(() => {
    const unsubAuth = initAuth((user) => {
      setAuthUser(user);
      setAuthReady(true);
      setHasGoogleToken(Boolean(getAccessToken()));

      if (user) {
        const displayName = user.displayName || 'Joaquim';
        const initials = displayName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        setUserProfile((prev) => ({
          ...prev,
          name: displayName.split(' ')[0],
          initials: initials || prev.initials,
          email: user.email || prev.email,
        }));
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authReady || !authUser) return;

    const unsubVault = subscribeVaultItems(authUser.uid, (items) => {
      setVault(items);
    });

    const unsubSkills = subscribeSkillsRpg(authUser.uid, (items) => {
      setSkills(items);
    });

    const unsubWishlist = subscribeWishlistItems(authUser.uid, (items) => {
      setWishlist(items);
    });

    const unsubSettings = subscribeWishlistSettings(authUser.uid, (pool) => {
      setExtraSavingsPool(pool);
    });

    const unsubHours = subscribeDailyHours(authUser.uid, (daysList) => {
      const baseWeek = INITIAL_ACTIVITY.map((day) => {
        const found = daysList.find(
          (d) => d.dateKey === day.dateKey || d.dateNum === day.dateNum
        );
        if (found) {
          return {
            ...day,
            hours: found.hours,
            focusTopic: found.focusTopic || day.focusTopic,
          };
        }
        return day;
      });
      setActivity(baseWeek);
    });

    const unsubConversations = subscribeAssistantConversations(
      authUser.uid,
      (convs) => {
        setAssistantConversations(convs);
      }
    );

    return () => {
      unsubVault();
      unsubSkills();
      unsubWishlist();
      unsubSettings();
      unsubHours();
      unsubConversations();
    };
  }, [authReady, authUser]);

  // ==========================================================================
  // 2. GOOGLE CALENDAR & GOOGLE TASKS REAL API SYNC
  // ==========================================================================
  const syncGoogleWorkspaceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setHasGoogleToken(false);
      return;
    }

    setHasGoogleToken(true);
    setIsSyncingGoogle(true);
    try {
      const now = new Date();
      const [calBlocks, tasksList] = await Promise.all([
        fetchGoogleCalendarEvents(now.getFullYear(), now.getMonth()),
        fetchGoogleTasks(),
      ]);
      setSchedule(calBlocks);
      setGoogleTasks(tasksList);
    } catch {
      showNotification(
        'No se pudo sincronizar Google Calendar/Tasks. Verifica los permisos.'
      );
    } finally {
      setIsSyncingGoogle(false);
    }
  }, [showNotification]);

  const handleConnectGoogleWorkspace = async () => {
    try {
      const { user, accessToken } = await googleSignInWithWorkspace();
      setAuthUser(user);
      if (accessToken) {
        setHasGoogleToken(true);
        await syncGoogleWorkspaceData();
        showNotification(
          'Conectado a Firebase Firestore, Google Calendar y Google Tasks'
        );
        pushActivityAlert(
          'Google Workspace & Firebase Conectados',
          'Sincronización en tiempo real activa con tu cuenta de Google.',
          'calendar',
          'calendar'
        );
      } else {
        showNotification('Sesión iniciada en Firebase correctamente');
      }
    } catch {
      showNotification(
        'No se completó el inicio de sesión con Google. Inténtalo de nuevo.'
      );
    }
  };

  const handleLogout = async () => {
    await logoutFirebase();
    setAuthUser(null);
    setHasGoogleToken(false);
    showNotification('Sesión cerrada');
  };

  // ==========================================================================
  // 2B. SPOTIFY OFFICIAL OAUTH 2.0 PKCE POPUP FLOW & MESSAGE LISTENER
  // ==========================================================================
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'SPOTIFY_OAUTH_CODE') return;
      const { code, error } = event.data;
      if (error) {
        setIsConnectingSpotify(false);
        showNotification(`Autenticación de Spotify cancelada: ${error}`);
        return;
      }
      if (code) {
        setIsConnectingSpotify(true);
        const res = await completeSpotifyPkceHandshake(String(code));
        setIsConnectingSpotify(false);
        if (res.ok && res.profile) {
          setSpotifyProfile(res.profile);
          showNotification(
            `Conectado a Spotify como ${res.profile.displayName}`
          );
          pushActivityAlert(
            `Spotify Vinculado: ${res.profile.displayName}`,
            'OAuth 2.0 PKCE activo. Ya puedes importar tus playlists y guardar canciones con el Asistente.',
            'vault',
            'vault'
          );
        } else {
          showNotification(
            res.error || 'No se pudo completar la vinculación con Spotify.'
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [showNotification, pushActivityAlert]);

  const handleConnectSpotify = async (overrideClientId?: string) => {
    setIsConnectingSpotify(true);
    const result = await startSpotifyPkcePopup(overrideClientId);
    if (!result.started) {
      setIsConnectingSpotify(false);
      if (result.error === 'MISSING_CLIENT_ID') {
        setIsSpotifyClientModalOpen(true);
      } else if (result.error) {
        showNotification(result.error);
      }
    } else {
      // Reset loading indicator after a timeout if user closes popup manually
      setTimeout(() => {
        setIsConnectingSpotify(false);
      }, 15000);
    }
  };

  const handleDisconnectSpotify = () => {
    disconnectSpotify();
    setSpotifyProfile(null);
    showNotification('Cuenta de Spotify desvinculada');
  };

  // ==========================================================================
  // 3. CRUD HANDLERS CONNECTED TO FIRESTORE & GOOGLE APIS
  // ==========================================================================
  const handleAddSkillHours = async (skillId: string, hours = 1) => {
    const targetSkill = skills.find((s) => s.id === skillId);
    if (!targetSkill) return;

    const rawProgress = targetSkill.progress + Math.round(hours * 10);
    const leveledUp = rawProgress >= 100;
    const nextHours = Number((targetSkill.hoursInvested + hours).toFixed(1));
    const nextLevel = leveledUp ? targetSkill.level + 1 : targetSkill.level;
    const nextProgress = leveledUp ? rawProgress - 100 : rawProgress;

    const selectedDayObj =
      activity.find((d) => d.dateNum === selectedActivityDate) ||
      activity[activity.length - 1];

    const updatedSkillObj: SkillItem = {
      ...targetSkill,
      hoursInvested: nextHours,
      level: nextLevel,
      progress: nextProgress,
    };

    const updatedDayObj: DailyActivity = {
      ...(selectedDayObj || {
        dayShort: 'Hoy',
        dayLabel: 'Hoy',
        dateNum: selectedActivityDate,
        hours: 0,
        focusTopic: targetSkill.name,
      }),
      hours: Number(((selectedDayObj?.hours || 0) + hours).toFixed(1)),
      focusTopic: targetSkill.name,
    };

    if (authUser) {
      await Promise.all([
        updateSkillRpgDoc(authUser.uid, skillId, updatedSkillObj),
        upsertDailyHoursDoc(authUser.uid, updatedDayObj),
      ]);
    } else {
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? updatedSkillObj : s))
      );
      setActivity((prev) =>
        prev.map((d) =>
          d.dateNum === selectedActivityDate ? updatedDayObj : d
        )
      );
    }

    const isSports = targetSkill.branch === 'sports';
    showNotification(
      isSports
        ? `+${hours} entrenamiento sumado a "${targetSkill.name}"`
        : `+${hours}h sumadas a "${targetSkill.name}"`
    );
    pushActivityAlert(
      `${isSports ? `+${hours} Entreno` : `+${hours}h`} · ${targetSkill.name}`,
      `Guardado en ${authUser ? 'Firestore (skills_rpg & daily_hours)' : 'memoria local'}.`,
      'skills',
      'skills'
    );
  };

  const handleToggleMilestone = async (
    skillId: string,
    milestoneId: string
  ) => {
    const targetSkill = skills.find((s) => s.id === skillId);
    if (!targetSkill) return;

    const todayLabel = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
    const updatedMilestones = targetSkill.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, unlocked: !m.unlocked, date: todayLabel }
        : m
    );
    const nextProgress = Math.min(100, targetSkill.progress + 10);
    const updatedSkillObj: SkillItem = {
      ...targetSkill,
      milestones: updatedMilestones,
      progress: nextProgress,
    };

    if (authUser) {
      await updateSkillRpgDoc(authUser.uid, skillId, updatedSkillObj);
    } else {
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? updatedSkillObj : s))
      );
    }
    showNotification('Bitácora de hitos actualizada');
  };

  const handleAddMilestone = async (
    skillId: string,
    title: string,
    badge?: string
  ) => {
    const targetSkill = skills.find((s) => s.id === skillId);
    if (!targetSkill) return;

    const todayLabel = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
    const newM = {
      id: `m-${Date.now()}`,
      title,
      unlocked: true,
      date: todayLabel,
      badge: badge || 'Logro',
    };
    const updatedMilestones = [newM, ...targetSkill.milestones];
    const nextProgress = Math.min(100, targetSkill.progress + 10);
    const updatedSkillObj: SkillItem = {
      ...targetSkill,
      milestones: updatedMilestones,
      progress: nextProgress,
    };

    if (authUser) {
      await updateSkillRpgDoc(authUser.uid, skillId, updatedSkillObj);
    } else {
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? updatedSkillObj : s))
      );
    }
    showNotification(`Nuevo récord guardado: "${title}"`);
  };

  const handleAddSavings = async (itemId: string, amount: number) => {
    const target = wishlist.find((i) => i.id === itemId);
    if (!target) return;

    const nextSaved = Math.min(
      target.estimatedPrice,
      target.savedAmount + amount
    );
    const updatedWish: WishlistItem = { ...target, savedAmount: nextSaved };
    if (authUser) {
      await updateWishlistItemDoc(authUser.uid, itemId, updatedWish);
    } else {
      setWishlist((prev) =>
        prev.map((item) => (item.id === itemId ? updatedWish : item))
      );
    }
    showNotification(`Abonaste +$${amount} USD a "${target.name}"`);
  };

  const handleUpdateSavingsPool = async (nextPool: number) => {
    const cleanPool = Math.max(0, nextPool);
    setExtraSavingsPool(cleanPool);
    if (authUser) {
      await saveWishlistSettingsDoc(authUser.uid, cleanPool);
    }
  };

  const handleTogglePurchased = async (itemId: string) => {
    const target = wishlist.find((i) => i.id === itemId);
    if (!target) return;

    const isNowPurchased = !target.purchased;
    const nextSaved = isNowPurchased
      ? target.estimatedPrice
      : target.savedAmount;
    const updatedWish: WishlistItem = {
      ...target,
      purchased: isNowPurchased,
      savedAmount: nextSaved,
    };

    if (authUser) {
      await updateWishlistItemDoc(authUser.uid, itemId, updatedWish);
    } else {
      setWishlist((prev) =>
        prev.map((item) => (item.id === itemId ? updatedWish : item))
      );
    }
    showNotification(
      isNowPurchased
        ? `¡"${target.name}" marcado como comprado!`
        : `"${target.name}" devuelto a pendientes`
    );
  };

  const handleToggleScheduleBlock = (blockId: string) => {
    setSchedule((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, completion: b.completion === 100 ? 0 : 100 }
          : b
      )
    );
  };

  // Manual Creation & Editing Handlers (Modals)
  const handleOpenEditVault = (item: VaultItem) => {
    setEditingVaultItem(item);
    setDefaultVaultGroup(item.vaultGroup);
    setCreateModalMode('vault');
  };

  const handleCreateVault = async (newItem: Omit<VaultItem, 'id'>) => {
    if (authUser) {
      await createVaultItemDoc(authUser.uid, newItem);
    } else {
      const created: VaultItem = { ...newItem, id: `vault-${Date.now()}` };
      setVault((prev) => [created, ...prev]);
    }
    setEditingVaultItem(null);
    showNotification(`"${newItem.title}" guardado en tu Bóveda`);
    pushActivityAlert(
      `Nuevo registro en Bóveda: ${newItem.title}`,
      `${newItem.category} · ${newItem.rating}/10 (Tier ${newItem.tier}).`,
      'vault',
      'vault'
    );
  };

  const handleUpdateVault = async (updatedItem: VaultItem) => {
    if (authUser) {
      await updateVaultItemDoc(authUser.uid, updatedItem.id, updatedItem);
    } else {
      setVault((prev) =>
        prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
      );
    }
    setEditingVaultItem(null);
    showNotification(`Cambios actualizados en "${updatedItem.title}"`);
    pushActivityAlert(
      `Registro actualizado en Bóveda: ${updatedItem.title}`,
      `${updatedItem.category} · ${updatedItem.rating}/10 (Tier ${updatedItem.tier}).`,
      'vault',
      'vault'
    );
  };

  const handleCreateSkill = async (newSkill: Omit<SkillItem, 'id'>) => {
    if (authUser) {
      await createSkillRpgDoc(authUser.uid, newSkill);
    } else {
      const created: SkillItem = { ...newSkill, id: `skill-${Date.now()}` };
      setSkills((prev) => [created, ...prev]);
    }
    showNotification(`Habilidad "${newSkill.name}" creada`);
    pushActivityAlert(
      `Nueva Habilidad RPG: ${newSkill.name}`,
      `Lv. ${newSkill.level} · Rama ${newSkill.branch === 'sports' ? 'Deporte' : 'Aprendizaje'}.`,
      'skills',
      'skills'
    );
  };

  const handleCreateWishlist = async (newWish: Omit<WishlistItem, 'id'>) => {
    if (authUser) {
      await createWishlistItemDoc(authUser.uid, newWish);
    } else {
      const created: WishlistItem = { ...newWish, id: `wish-${Date.now()}` };
      setWishlist((prev) => [created, ...prev]);
    }
    showNotification(`"${newWish.name}" añadido a tu Wishlist`);
  };

  const handleCreateSchedule = async (newBlock: Omit<ScheduleBlock, 'id'>) => {
    const token = getAccessToken();
    if (token) {
      try {
        const now = new Date();
        const { startIso, endIso } = buildEventIsoRange(
          newBlock.dayOfMonth,
          newBlock.time,
          now.getFullYear(),
          now.getMonth()
        );
        const createdGoogleBlock = await createGoogleCalendarEvent({
          title: newBlock.title,
          startIso,
          endIso,
        });
        setSchedule((prev) => [
          ...prev,
          { ...createdGoogleBlock, accent: newBlock.accent },
        ]);
        showNotification(
          `Evento "${newBlock.title}" creado en Google Calendar`
        );
        return;
      } catch {
        // Fallback to local schedule state if token expired
      }
    }

    const created: ScheduleBlock = { ...newBlock, id: `sch-${Date.now()}` };
    setSchedule((prev) => [...prev, created]);
    showNotification(`Bloque "${created.title}" agendado en tu Cronograma`);
  };

  // Assistant Conversation History Handlers (Firestore + local backup)
  const handleSaveAssistantConversation = async (
    conv: AssistantConversation
  ) => {
    setAssistantConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== conv.id);
      return [conv, ...filtered].slice(0, 20);
    });
    if (authUser) {
      try {
        await saveAssistantConversationDoc(authUser.uid, conv);
      } catch {
        // fallback already updated in state
      }
    }
  };

  const handleDeleteAssistantConversation = async (convId: string) => {
    setAssistantConversations((prev) => prev.filter((c) => c.id !== convId));
    if (authUser) {
      try {
        await deleteAssistantConversationDoc(convId);
      } catch {
        // ignore transient error
      }
    }
    showNotification('Conversación eliminada del historial');
  };

  // Google Tasks Handlers
  const handleCreateGoogleTask = async (title: string, notes?: string) => {
    const token = getAccessToken();
    if (token) {
      try {
        const createdTask = await createGoogleTaskItem({ title, notes });
        setGoogleTasks((prev) => [createdTask, ...prev]);
        showNotification(`Tarea "${title}" creada en Google Tasks`);
        return;
      } catch {
        // fallback below
      }
    }
    const localTask: GoogleTaskItem = {
      id: `task-${Date.now()}`,
      title,
      notes,
      status: 'needsAction',
    };
    setGoogleTasks((prev) => [localTask, ...prev]);
    showNotification(`Tarea "${title}" agregada a tu lista`);
  };

  const handleToggleGoogleTask = async (task: GoogleTaskItem) => {
    const nextCompleted = task.status !== 'completed';
    const token = getAccessToken();
    setGoogleTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: nextCompleted ? 'completed' : 'needsAction' }
          : t
      )
    );
    if (token && !task.id.startsWith('task-')) {
      try {
        await updateGoogleTaskStatus(task.id, nextCompleted);
      } catch {
        // ignore transient error
      }
    }
  };

  // Confirmation-Protected Delete Handlers (Mandatory per Workspace & Firestore safety)
  const requestDeleteVaultItem = (item: VaultItem) => {
    setPendingDelete({
      title: `¿Eliminar "${item.title}" de tu Bóveda?`,
      subtitle:
        'Esta acción borrará permanentemente el registro de tu colección vault_items.',
      onConfirm: async () => {
        if (authUser) {
          await deleteVaultItemDoc(item.id);
        } else {
          setVault((prev) => prev.filter((v) => v.id !== item.id));
        }
        showNotification(`"${item.title}" eliminado de la Bóveda`);
      },
    });
  };

  const requestDeleteSkill = (skill: SkillItem) => {
    setPendingDelete({
      title: `¿Eliminar la habilidad "${skill.name}"?`,
      subtitle:
        'Se eliminará la tarjeta y sus hitos de la colección skills_rpg.',
      onConfirm: async () => {
        if (authUser) {
          await deleteSkillRpgDoc(skill.id);
        } else {
          setSkills((prev) => prev.filter((s) => s.id !== skill.id));
        }
        showNotification(`Habilidad "${skill.name}" eliminada`);
      },
    });
  };

  const requestDeleteWishlistItem = (item: WishlistItem) => {
    setPendingDelete({
      title: `¿Eliminar "${item.name}" de tu Wishlist?`,
      subtitle: 'El producto se borrará de la colección wishlist_items.',
      onConfirm: async () => {
        if (authUser) {
          await deleteWishlistItemDoc(item.id);
        } else {
          setWishlist((prev) => prev.filter((w) => w.id !== item.id));
        }
        showNotification(`"${item.name}" eliminado de tu Wishlist`);
      },
    });
  };

  const requestDeleteScheduleBlock = (block: ScheduleBlock) => {
    setPendingDelete({
      title: `¿Eliminar el evento "${block.title}"?`,
      subtitle: block.googleEventId
        ? 'Este evento se eliminará directamente de tu Google Calendar.'
        : 'Este bloque se quitará de tu cronograma.',
      onConfirm: async () => {
        const token = getAccessToken();
        if (token && block.googleEventId) {
          try {
            await deleteGoogleCalendarEvent(block.googleEventId);
          } catch {
            // continue removing from state
          }
        }
        setSchedule((prev) => prev.filter((b) => b.id !== block.id));
        showNotification(`Evento "${block.title}" eliminado`);
      },
    });
  };

  const requestDeleteGoogleTask = (task: GoogleTaskItem) => {
    setPendingDelete({
      title: `¿Eliminar la tarea "${task.title}"?`,
      subtitle: 'Se eliminará de tu lista @default de Google Tasks.',
      onConfirm: async () => {
        const token = getAccessToken();
        if (token && !task.id.startsWith('task-')) {
          try {
            await deleteGoogleTaskItem(task.id);
          } catch {
            // continue
          }
        }
        setGoogleTasks((prev) => prev.filter((t) => t.id !== task.id));
        showNotification(`Tarea "${task.title}" eliminada`);
      },
    });
  };

  // ==========================================================================
  // 4. REAL AI ASSISTANT FUNCTION CALLING EXECUTOR (5 TOOLS)
  // ==========================================================================
  const handleExecuteAiAction = async (action: {
    name: string;
    args: Record<string, any>;
  }): Promise<AssistantActionRecord | null> => {
    const { name, args } = action;
    const todayFormatted = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    // TOOL 1: addVaultItem -> Firestore 'vault_items'
    if (name === 'addVaultItem') {
      const rating = Math.min(10, Math.max(1, Number(args.rating) || 9.4));
      const tier: VaultTier =
        args.tier === 'S' || args.tier === 'A' || args.tier === 'B'
          ? args.tier
          : rating >= 9
          ? 'S'
          : rating >= 7.8
          ? 'A'
          : 'B';

      const validGroups: Array<Exclude<VaultFilterId, 'todo'>> = [
        'peliculas_series',
        'proximamente',
        'musica',
        'videos',
        'personas',
        'momentos',
      ];
      const vaultGroup: Exclude<VaultFilterId, 'todo'> = validGroups.includes(
        args.vaultGroup
      )
        ? args.vaultGroup
        : 'peliculas_series';

      const categoryMap: Record<Exclude<VaultFilterId, 'todo'>, VaultCategory> =
        {
          peliculas_series: args.category === 'Serie' ? 'Serie' : 'Cine',
          proximamente: 'Próximamente',
          musica: 'Música',
          videos: 'Video',
          personas: 'Persona',
          momentos: 'Momento',
        };

      const rawTitle = String(args.title || 'Nueva Experiencia');
      const explicitImdbId = args.imdbId ? String(args.imdbId) : undefined;

      // Automatic Background Enrichment via Spotify API + IMDb/OMDb + Public Media APIs
      const mediaMatch = await findBestMediaMatch(
        rawTitle,
        vaultGroup,
        args.category ? String(args.category) : undefined,
        explicitImdbId,
        args.creator ? String(args.creator) : undefined
      );

      const finalCreator =
        args.creator &&
        !String(args.creator).includes('Life OS Assistant') &&
        !String(args.creator).includes('Aether Assistant') &&
        !String(args.creator).includes('Desconocido')
          ? String(args.creator)
          : mediaMatch?.creator || 'Registrado con Aether Assistant';

      const finalTags =
        Array.isArray(args.tags) &&
        args.tags.length > 0 &&
        !args.tags.includes('Destacado')
          ? args.tags.map(String)
          : mediaMatch?.tags && mediaMatch.tags.length > 0
          ? mediaMatch.tags
          : [categoryMap[vaultGroup], 'Favorito'];

      // Use official IMDb synopsis when the user asked the AI to fetch IMDb data without writing a long custom review
      const rawReview = args.review ? String(args.review) : '';
      const isGenericCommandReview =
        !rawReview ||
        rawReview.toLowerCase().includes('busca sus datos en imdb') ||
        rawReview.toLowerCase().includes('guarda la película') ||
        rawReview.toLowerCase().includes('guarda en mi bóveda') ||
        rawReview.includes('Registrado conversando');

      const finalReview =
        isGenericCommandReview && mediaMatch?.plot
          ? mediaMatch.plot
          : rawReview ||
            mediaMatch?.plot ||
            'Registrado conversando con Aether Assistant.';

      const upcomingCalc =
        vaultGroup === 'proximamente'
          ? computeReleaseCountdown(
              args.releaseDate
                ? String(args.releaseDate)
                : mediaMatch?.rawReleaseDate || mediaMatch?.releaseDate
            )
          : null;

      const fallbackSpotifyUrl =
        vaultGroup === 'musica'
          ? `https://open.spotify.com/search/${encodeURIComponent(
              `${mediaMatch?.title || rawTitle} ${finalCreator || ''}`.trim()
            )}`
          : undefined;

      const payload: Omit<VaultItem, 'id'> = {
        title: mediaMatch?.title || rawTitle,
        creator: finalCreator,
        category:
          vaultGroup === 'peliculas_series' && mediaMatch
            ? mediaMatch.mediaType === 'movie'
              ? 'Cine'
              : 'Serie'
            : categoryMap[vaultGroup],
        vaultGroup,
        rating,
        tier,
        consumedDate:
          vaultGroup === 'proximamente' ? 'En Espera' : todayFormatted,
        tags: finalTags,
        review: finalReview,
        accent:
          vaultGroup === 'proximamente' || vaultGroup === 'personas'
            ? 'lavender'
            : 'mint',
        artVariant:
          vaultGroup === 'musica'
            ? 'synth'
            : vaultGroup === 'videos'
            ? 'display'
            : vaultGroup === 'personas' || vaultGroup === 'momentos'
            ? 'japan'
            : 'cyberpunk',
        imageUrl: mediaMatch?.imageUrl,
        audioPreviewUrl: mediaMatch?.audioPreviewUrl,
        releaseYear: mediaMatch?.year,
        imdbId: mediaMatch?.imdbId || explicitImdbId,
        imdbRating: mediaMatch?.imdbRating,
        imdbVotes: mediaMatch?.imdbVotes,
        actors: mediaMatch?.actors,
        plot: mediaMatch?.plot,
        releaseDate:
          vaultGroup === 'proximamente'
            ? upcomingCalc?.formattedDate
            : undefined,
        daysRemaining:
          vaultGroup === 'proximamente'
            ? upcomingCalc?.daysRemaining ?? 15
            : undefined,
        releaseFormat:
          vaultGroup === 'proximamente'
            ? mediaMatch?.releaseFormat || 'Cine / Streaming'
            : undefined,
        videoUrl: mediaMatch?.videoUrl || fallbackSpotifyUrl,
        hypeLevel:
          vaultGroup === 'proximamente'
            ? Math.min(100, Math.max(0, Number(args.hypeLevel) || 95))
            : args.hypeLevel
            ? Number(args.hypeLevel)
            : undefined,
        keyTakeaway: args.keyTakeaway ? String(args.keyTakeaway) : undefined,
        isFeaturedMasterpiece: vaultGroup !== 'proximamente' && tier === 'S',
      };

      await handleCreateVault(payload);
      return {
        name: 'addVaultItem',
        summary: `${payload.title} (${
          payload.imdbRating ? `IMDb ${payload.imdbRating} ★ · ` : ''
        }Tu nota: ${payload.rating.toFixed(1)} ★ · Tier ${payload.tier})`,
        targetModule: 'vault',
        sourceBadge:
          vaultGroup === 'musica'
            ? 'Spotify API + Firestore'
            : authUser
            ? 'Firestore · vault_items'
            : 'Bóveda Local',
        accent: payload.accent,
        itemType: 'vault',
        title: payload.title,
        subtitle: `${payload.creator}${
          payload.releaseYear ? ` · ${payload.releaseYear}` : ''
        }`,
        imageUrl: payload.imageUrl,
        badgeText:
          vaultGroup === 'proximamente'
            ? payload.daysRemaining !== undefined
              ? `Faltan ${payload.daysRemaining}d`
              : 'Próximamente'
            : `${payload.rating.toFixed(1)} ★ · Tier ${payload.tier}`,
        secondaryBadge: payload.imdbRating
          ? `IMDb ${payload.imdbRating}`
          : vaultGroup === 'musica'
          ? 'Spotify Sync'
          : payload.category,
        progressPct:
          vaultGroup === 'proximamente'
            ? payload.hypeLevel ?? 95
            : Math.round(payload.rating * 10),
        progressLabel:
          vaultGroup === 'proximamente'
            ? `Hype ${payload.hypeLevel ?? 95}%`
            : `Nota personal ${payload.rating.toFixed(1)}/10`,
        spotifyUrl:
          vaultGroup === 'musica' ? payload.videoUrl : undefined,
        audioPreviewUrl: payload.audioPreviewUrl,
        tags: payload.tags,
        details: `${
          payload.imdbId ? `[${payload.imdbId}] ` : ''
        }${payload.actors ? `Reparto: ${payload.actors} · ` : ''}"${payload.review}"`,
      };
    }

    // TOOL 2: updateOrCreateSkill -> Firestore 'skills_rpg' + 'daily_hours'
    if (name === 'updateOrCreateSkill' || name === 'updateSkillProgress') {
      const targetName = String(args.skillName || 'Básquet · Tiro & Manejo');
      const hours = Number(args.hoursToAdd) || 1;
      const durationLabel = args.durationLabel
        ? String(args.durationLabel)
        : hours < 1
        ? `${Math.round(hours * 60)} min`
        : `${hours} ${
            args.branch === 'sports' ? 'entreno' : 'h'
          }`;
      const delta = Number(args.progressDelta) || Math.min(40, Math.round(hours * 15));
      const lowerTarget = targetName.toLowerCase();
      const isSports =
        args.branch === 'sports' ||
        lowerTarget.includes('básquet') ||
        lowerTarget.includes('basquet') ||
        lowerTarget.includes('fútbol') ||
        lowerTarget.includes('futbol') ||
        lowerTarget.includes('deporte');

      const existing = skills.find(
        (s) =>
          s.name.toLowerCase().includes(lowerTarget) ||
          lowerTarget.includes(s.name.toLowerCase().split('·')[0].trim())
      );

      const todayDayObj =
        activity.find((d) => d.dateNum === todayDateNum) ||
        activity[activity.length - 1];

      if (existing) {
        const rawProg = existing.progress + delta;
        const levelUp = rawProg >= 100;
        const nextHours = Number((existing.hoursInvested + hours).toFixed(2));
        const nextLevel = levelUp ? existing.level + 1 : existing.level;
        const nextProg = levelUp ? rawProg - 100 : rawProg;
        const updatedMilestones = args.newMilestone
          ? [
              {
                id: `m-ai-${Date.now()}`,
                title: String(args.newMilestone),
                unlocked: true,
                date: todayFormatted,
                badge: isSports ? '⚡ Deporte' : '🧠 Skill',
              },
              ...existing.milestones,
            ]
          : existing.milestones;

        const updatedSkillObj: SkillItem = {
          ...existing,
          hoursInvested: nextHours,
          level: nextLevel,
          progress: nextProg,
          milestones: updatedMilestones,
          sportStats: args.sportStats
            ? String(args.sportStats)
            : existing.sportStats,
        };

        const updatedDayObj: DailyActivity = {
          ...(todayDayObj || {
            dayShort: 'Hoy',
            dayLabel: 'Hoy',
            dateNum: todayDateNum,
            hours: 0,
            focusTopic: existing.name,
          }),
          hours: Number(((todayDayObj?.hours || 0) + hours).toFixed(2)),
          focusTopic: existing.name,
        };

        if (authUser) {
          await Promise.all([
            updateSkillRpgDoc(authUser.uid, existing.id, updatedSkillObj),
            upsertDailyHoursDoc(authUser.uid, updatedDayObj),
          ]);
        } else {
          setSkills((prev) =>
            prev.map((s) => (s.id === existing.id ? updatedSkillObj : s))
          );
          setActivity((prev) =>
            prev.map((d) => (d.dateNum === todayDateNum ? updatedDayObj : d))
          );
        }

        return {
          name: 'updateOrCreateSkill',
          summary: `${existing.name} (+${durationLabel} · +${delta} XP · Lv. ${nextLevel})`,
          targetModule: 'skills',
          sourceBadge: authUser ? 'Firestore · skills_rpg' : 'Skills Local',
          accent: existing.accent,
          itemType: 'skill',
          title: existing.name,
          subtitle: `${existing.category} · Total ${nextHours} ${existing.unitLabel}`,
          badgeText: `Lv. ${nextLevel}${levelUp ? ' ⬆️' : ''}`,
          secondaryBadge: `+${delta} XP · +${durationLabel}`,
          progressPct: nextProg,
          progressLabel: `${nextProg}% XP hacia Lv. ${nextLevel + 1}`,
          tags: existing.tags,
          details: args.newMilestone
            ? `Hito registrado: "${args.newMilestone}"`
            : `Progreso actualizado a ${nextProg}% XP`,
        };
      } else {
        const initialProg = Math.min(95, delta);
        const newSkillPayload: Omit<SkillItem, 'id'> = {
          name: targetName,
          category: String(
            args.category ||
              (isSports ? 'Deporte · Rendimiento' : 'Aprendizaje & Proyectos')
          ),
          branch: isSports ? 'sports' : 'learning',
          unitLabel: isSports ? 'Entrenamientos' : 'h',
          sportStats: args.sportStats ? String(args.sportStats) : undefined,
          level: 1,
          progress: initialProg,
          hoursInvested: hours,
          weeklyTargetHours: 5,
          accent: isSports ? 'mint' : 'lavender',
          iconName: isSports ? 'trophy' : 'sparkles',
          tags: isSports
            ? ['Cancha', 'Ritmo', 'Técnica']
            : ['Práctica', 'Deep Work'],
          milestones: [
            {
              id: `m-ai-${Date.now()}`,
              title: String(
                args.newMilestone ||
                  `Sesión registrada (+${durationLabel} · +${delta} XP)`
              ),
              unlocked: true,
              date: todayFormatted,
              badge: isSports ? '⚡ Deporte' : '🧠 Skill',
            },
          ],
        };

        await handleCreateSkill(newSkillPayload);
        const updatedDayObj: DailyActivity = {
          ...(todayDayObj || {
            dayShort: 'Hoy',
            dayLabel: 'Hoy',
            dateNum: todayDateNum,
            hours: 0,
            focusTopic: newSkillPayload.name,
          }),
          hours: Number(((todayDayObj?.hours || 0) + hours).toFixed(2)),
          focusTopic: newSkillPayload.name,
        };
        if (authUser) {
          await upsertDailyHoursDoc(authUser.uid, updatedDayObj);
        } else {
          setActivity((prev) =>
            prev.map((d) => (d.dateNum === todayDateNum ? updatedDayObj : d))
          );
        }

        return {
          name: 'updateOrCreateSkill',
          summary: `Nueva habilidad: ${newSkillPayload.name} (Lv. 1 · +${delta} XP)`,
          targetModule: 'skills',
          sourceBadge: authUser ? 'Firestore · skills_rpg' : 'Skills Local',
          accent: newSkillPayload.accent,
          itemType: 'skill',
          title: newSkillPayload.name,
          subtitle: `${newSkillPayload.category} · +${durationLabel}`,
          badgeText: 'Lv. 1',
          secondaryBadge: `+${delta} XP`,
          progressPct: initialProg,
          progressLabel: `${initialProg}% XP hacia Lv. 2`,
          tags: newSkillPayload.tags,
          details: args.newMilestone
            ? `Hito registrado: "${args.newMilestone}"`
            : `Creada con +${durationLabel} y bitácora activa.`,
        };
      }
    }

    // TOOL 3: manageWishlist -> Firestore 'wishlist_items' or 'wishlist_settings'
    if (name === 'manageWishlist' || name === 'addWishlistItem') {
      if (args.actionType === 'update_savings_pool') {
        const poolAmount = Math.max(0, Number(args.extraSavingsPool) || 0);
        await handleUpdateSavingsPool(poolAmount);
        showNotification(
          `Fondo de Ahorro Disponible actualizado a $${poolAmount} USD`
        );
        return {
          name: 'manageWishlist',
          summary: `Fondo de Ahorro Disponible: $${poolAmount} USD`,
          targetModule: 'wishlist',
          sourceBadge: authUser
            ? 'Firestore · wishlist_settings'
            : 'Wishlist Local',
          accent: 'mint',
          itemType: 'wishlist',
          title: 'Fondo de Ahorro Disponible',
          subtitle: 'Presupuesto inteligente actualizado',
          badgeText: `$${poolAmount} USD`,
          secondaryBadge: 'Ahorro Activo',
          progressPct: 100,
          progressLabel: 'Radar de compras sincronizado',
          details:
            'El radar de compras disponibles hoy se ha recalculado automáticamente.',
        };
      }

      const price = Math.max(5, Number(args.estimatedPrice) || 180);
      const saved = Math.min(price, Math.max(0, Number(args.savedAmount) || 0));
      const priority: WishlistPriority = ['Alta', 'Media', 'Capricho'].includes(
        args.priority
      )
        ? args.priority
        : 'Alta';

      const validTags = [
        'Tech',
        'Deporte / Básquet & Fútbol',
        'Setup',
        'Caprichos',
      ] as const;
      const wishlistTag = validTags.includes(args.wishlistTag)
        ? args.wishlistTag
        : 'Tech';

      const newWishPayload: Omit<WishlistItem, 'id'> = {
        name: String(args.name || 'Meta Material'),
        category: wishlistTag,
        wishlistTag,
        estimatedPrice: price,
        savedAmount: saved,
        priority,
        link: 'https://google.com',
        notes: 'Registrado mediante Aether Assistant.',
        accent: priority === 'Alta' ? 'mint' : 'lavender',
        artVariant:
          wishlistTag === 'Deporte / Básquet & Fútbol' ? 'rpg' : 'keyboard',
      };

      await handleCreateWishlist(newWishPayload);
      const savedPct = Math.min(
        100,
        Math.round(((saved + extraSavingsPool) / price) * 100)
      );
      return {
        name: 'manageWishlist',
        summary: `${newWishPayload.name} ($${newWishPayload.estimatedPrice} USD)`,
        targetModule: 'wishlist',
        sourceBadge: authUser ? 'Firestore · wishlist_items' : 'Wishlist Local',
        accent: newWishPayload.accent,
        itemType: 'wishlist',
        title: newWishPayload.name,
        subtitle: `${newWishPayload.wishlistTag} · Meta $${price} USD`,
        badgeText: `$${price} USD`,
        secondaryBadge: `Prioridad ${newWishPayload.priority}`,
        progressPct: savedPct,
        progressLabel: `${savedPct}% cubierto con tu ahorro`,
        details: `Prioridad ${newWishPayload.priority} · Categoría: ${newWishPayload.wishlistTag}`,
      };
    }

    // TOOL 4: scheduleCalendarEvent -> Google Calendar API POST
    if (name === 'scheduleCalendarEvent' || name === 'addScheduleBlock') {
      const dayNum = Math.min(
        31,
        Math.max(1, Number(args.dayOfMonth) || todayDateNum)
      );
      const timeRange = String(args.timeRange || args.time || '18:00 - 19:30');
      const accent: 'mint' | 'lavender' =
        args.accent === 'lavender' ? 'lavender' : 'mint';
      const title = String(args.title || 'Entrenamiento / Sesión Enfocada');

      await handleCreateSchedule({
        title,
        time: timeRange,
        dayOfMonth: dayNum,
        completion: 0,
        category: 'Deep Work',
        accent,
        syncedSource: getAccessToken() ? 'Google Calendar' : 'Local Agenda',
      });
      setSelectedCalendarDay(dayNum);

      return {
        name: 'scheduleCalendarEvent',
        summary: `${title} · Día ${dayNum} (${timeRange})`,
        targetModule: 'calendar',
        sourceBadge: getAccessToken()
          ? 'Google Calendar API'
          : 'Agenda + Firestore',
        accent,
        itemType: 'calendar',
        title,
        subtitle: `Día ${dayNum} del mes · ${timeRange}`,
        badgeText: timeRange,
        secondaryBadge: `Día ${dayNum}`,
        progressPct: 100,
        progressLabel: getAccessToken()
          ? 'Sincronizado con Google Calendar'
          : 'Agendado en Cronograma Aether',
        details: args.description
          ? String(args.description)
          : 'Evento sincronizado en tu línea de tiempo horizontal.',
      };
    }

    // TOOL 5: createGoogleTask -> Google Tasks API POST
    if (name === 'createGoogleTask') {
      const title = String(args.title || 'Nueva tarea pendiente');
      const notes = args.notes ? String(args.notes) : undefined;
      await handleCreateGoogleTask(title, notes);

      return {
        name: 'createGoogleTask',
        summary: `Tarea: ${title}`,
        targetModule: 'calendar',
        sourceBadge: getAccessToken()
          ? 'Google Tasks API (@default)'
          : 'Tasks Local',
        accent: 'lavender',
        itemType: 'task',
        title,
        subtitle: 'Google Tasks · Pendiente',
        badgeText: 'Por hacer',
        secondaryBadge: 'Tasks Sync',
        progressPct: 100,
        progressLabel: 'Lista de tareas actualizada',
        details: notes || 'Añadida a tu lista de tareas pendientes.',
      };
    }

    return null;
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      userProfile,
      skills,
      vault,
      wishlist,
      extraSavingsPool,
      schedule,
      googleTasks,
      activity,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-backup-${userProfile.name.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup JSON de Aether descargado correctamente');
  };

  const totalGlobalHours = Math.round(
    skills.reduce((acc, s) => acc + s.hoursInvested, 0)
  );
  const totalGlobalLevels = skills.reduce((acc, s) => acc + s.level, 0);
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const getAvatarBgClass = () => {
    if (userProfile.avatarAccent === 'mint')
      return 'bg-mint-gradient text-[#141519] keep-dark-text';
    if (userProfile.avatarAccent === 'lavender')
      return 'bg-lavender-gradient text-[#141519] keep-dark-text';
    if (userProfile.avatarAccent === 'sky')
      return 'bg-[#CAE9F5] text-[#141519] keep-dark-text';
    return 'bg-[#141519] text-white';
  };

  const navItems: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    { id: 'vault', label: 'Bóveda', icon: <BookMarked className="w-4 h-4" /> },
    { id: 'skills', label: 'Habilidades', icon: <Flame className="w-4 h-4" /> },
    {
      id: 'wishlist',
      label: 'Wishlist',
      icon: <ShoppingBag className="w-4 h-4" />,
    },
    {
      id: 'calendar',
      label: 'Calendario',
      icon: <CalendarIcon className="w-4 h-4" />,
    },
  ];

  const filteredVaultRecents = vault
    .filter(
      (item) =>
        !vaultMiniSearch.trim() ||
        item.title.toLowerCase().includes(vaultMiniSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(vaultMiniSearch.toLowerCase())
    )
    .slice(0, 4);

  const dayScheduleBlocks = schedule.filter(
    (b) => b.dayOfMonth === selectedCalendarDay
  );
  const dashboardScheduleBlocks =
    dayScheduleBlocks.length > 0
      ? dayScheduleBlocks.slice(0, 4)
      : schedule.slice(0, 4);

  const currentHour = new Date().getHours();
  const timeOfDayGreeting =
    currentHour < 12
      ? 'Buenos días'
      : currentHour < 19
      ? 'Buenas tardes'
      : 'Buenas noches';

  const pendingDailyTasks = googleTasks.filter((t) => t.status !== 'completed');

  const nearestHypeRadarItems = vault
    .filter((item) => item.vaultGroup === 'proximamente')
    .map((item) => ({
      item,
      countdown: getAccurateHypeCountdown(item.releaseDate, item.daysRemaining),
    }))
    .sort((a, b) => a.countdown.daysRemaining - b.countdown.daysRemaining)
    .slice(0, 2);

  return (
    <div
      className={`min-h-screen w-full overflow-x-hidden p-2 sm:p-5 pb-28 md:pb-8 transition-colors duration-200 ${
        themeMode === 'dark' ? 'theme-dark bg-[#0D0E12]' : 'bg-[#EBF0F5]'
      }`}
    >
      {/* Outer App Container (#F3F6F8 in Light, #141519 in Dark, rounded-[32px], max-w-[1440px]) */}
      <div className="app-canvas-container max-w-[1440px] mx-auto bg-[#F3F6F8] rounded-[24px] sm:rounded-[32px] p-3.5 sm:p-6 border border-white/80 shadow-bento transition-colors duration-200">
        {/* ====================================================================
            TOP BAR: FLOATING DIRECTLY ON #F3F6F8 (NO WHITE CONTAINER BOX)
        ==================================================================== */}
        <header className="mb-5 sm:mb-7 relative">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Logo + Individual Pill Tabs */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 sm:gap-2.5 mr-1 sm:mr-2 cursor-pointer shrink-0 min-h-[40px]"
              >
                <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#A8E6E3] border-2 border-[#141519] flex items-center justify-center text-[#141519] keep-dark-text shadow-2xs shrink-0">
                  <Compass className="w-4 h-4 stroke-[2.2]" />
                </span>
                <span className="text-[1.1rem] sm:text-[1.15rem] font-bold tracking-tight text-[#141519] whitespace-nowrap">
                  Aether
                </span>
              </button>

              <nav className="hidden md:flex items-center gap-2">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`rounded-full px-4 py-2.5 text-[0.83rem] font-semibold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#141519] text-white shadow-xs ring-1 ring-white/15'
                          : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)]'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: Iniciar sesión / Auth Pill + Bell Popover + Theme Switcher Pill + Profile Modal */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 relative">
              {authUser ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      hasGoogleToken
                        ? syncGoogleWorkspaceData()
                        : handleConnectGoogleWorkspace()
                    }
                    title="Sincronizar cuenta de Google"
                    className="h-10 pl-2 pr-2.5 sm:pr-3.5 rounded-full bg-[#FFFFFF] hover:bg-[#F7F9FB] text-[#141519] text-[0.76rem] font-semibold flex items-center gap-1.5 sm:gap-2 shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)] cursor-pointer"
                  >
                    {authUser.photoURL ? (
                      <img
                        src={authUser.photoURL}
                        alt={authUser.displayName || 'Usuario'}
                        className="w-6 h-6 rounded-full object-cover border border-[#141519]/20"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.68rem] font-bold flex items-center justify-center">
                        {userProfile.initials}
                      </span>
                    )}
                    <span className="hidden sm:inline max-w-[110px] truncate">
                      {authUser.displayName?.split(' ')[0] || userProfile.name}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#6CD4CE] shrink-0" />
                    {isSyncingGoogle && (
                      <RefreshCw className="w-3.5 h-3.5 text-[#6E7480] animate-spin" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                    className="h-10 w-10 sm:w-auto sm:px-3 rounded-full bg-[#FFFFFF] hover:bg-[#F7F9FB] text-[#6E7480] hover:text-[#141519] text-[0.75rem] font-semibold flex items-center justify-center gap-1.5 shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)] cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Salir</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectGoogleWorkspace}
                  title="Iniciar sesión con Google"
                  className="h-10 px-3 sm:px-4 rounded-full bg-[#FFFFFF] hover:bg-[#A8E6E3]/40 text-[#141519] text-[0.75rem] sm:text-[0.78rem] font-bold flex items-center gap-1.5 sm:gap-2 shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)] transition-colors cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-[#141519] shrink-0" />
                  <span className="hidden xs:inline sm:inline">Iniciar sesión</span>
                </button>
              )}

              {/* 1. Circular white notification button */}
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                aria-label="Abrir centro de notificaciones"
                title="Centro de Notificaciones"
                className={`relative w-10 h-10 rounded-full bg-[#FFFFFF] text-[#141519] hover:bg-[#F7F9FB] flex items-center justify-center shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)] transition-all cursor-pointer shrink-0 ${
                  isNotificationsOpen ? 'ring-2 ring-[#A8E6E3]' : ''
                }`}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6CD4CE] text-[#141519] keep-dark-text text-[0.65rem] font-bold flex items-center justify-center border-2 border-white tabular-nums">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              <NotificationsPopover
                isOpen={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
                notifications={notifications}
                onMarkAsRead={(id) =>
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === id ? { ...n, read: true } : n))
                  )
                }
                onMarkAllAsRead={() =>
                  setNotifications((prev) =>
                    prev.map((n) => ({ ...n, read: true }))
                  )
                }
                onDeleteNotification={(id) =>
                  setNotifications((prev) => prev.filter((n) => n.id !== id))
                }
                onClearAll={() => setNotifications([])}
                onSelectNotification={(item) => {
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
                  );
                  setActiveTab(item.targetTab);
                  setIsNotificationsOpen(false);
                }}
              />

              {/* 2. White pill theme switcher with active black circle (Sun = Light / Moon = Dark) */}
              <button
                type="button"
                onClick={() => {
                  const next = themeMode === 'light' ? 'dark' : 'light';
                  setThemeMode(next);
                  showNotification(
                    next === 'dark'
                      ? 'Modo Oscuro Charcoal activado'
                      : 'Modo Claro Soft Bento activado'
                  );
                }}
                aria-label="Alternar modo claro u oscuro"
                title={
                  themeMode === 'light'
                    ? 'Cambiar a Modo Oscuro'
                    : 'Cambiar a Modo Claro'
                }
                className="h-10 px-1.5 rounded-full bg-[#FFFFFF] flex items-center gap-1 shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)] cursor-pointer border border-transparent hover:border-[#EEF1F5] shrink-0"
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    themeMode === 'light'
                      ? 'bg-[#141519] text-white shadow-2xs'
                      : 'text-[#6E7480]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                </span>
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    themeMode === 'dark'
                      ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text shadow-2xs'
                      : 'text-[#6E7480]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                </span>
              </button>

              {/* 3. Circular user avatar with white border -> opens interactive UserProfileModal */}
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                aria-label="Abrir configuración de perfil"
                title={`Perfil de ${userProfile.name} · Lv. ${totalGlobalLevels} ${userProfile.roleTitle}`}
                className={`w-10 h-10 rounded-full border-2 border-white font-bold text-[0.82rem] flex items-center justify-center shadow-[0_2px_10px_-2px_rgba(20,21,25,0.08)] overflow-hidden cursor-pointer transition-transform hover:scale-105 shrink-0 ${getAvatarBgClass()}`}
              >
                <span>{userProfile.initials}</span>
              </button>
            </div>
          </div>

          {/* Mobile Touch-Friendly Top Pill Navigation Strip */}
          <nav
            aria-label="Pestañas principales en móvil"
            className="md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pt-3 pb-1 -mx-1 px-1"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`h-10 rounded-full px-4 text-[0.8rem] font-semibold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#141519] text-white shadow-xs ring-1 ring-white/15'
                      : 'bg-[#FFFFFF] text-[#6E7480] hover:text-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.05)]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* ====================================================================
            HERO ROW: INVERTED GREETING + LEVEL BADGE (LEFT) | SEARCH + AI (RIGHT)
        ==================================================================== */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 mb-5 sm:mb-6 px-0.5 sm:px-1">
          <div className="min-w-0">
            <p className="text-[0.82rem] sm:text-[0.875rem] font-medium text-[#6E7480] mb-1 truncate">
              Hola, {userProfile.name} 👋 —{' '}
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-[#141519]">
                Bienvenido a Aether
              </h1>
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                title="Editar perfil y rango RPG"
                className="h-9 px-3.5 rounded-full bg-[#CAE9F5] text-[#141519] keep-dark-text text-[0.75rem] font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs hover:brightness-95 transition-all cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-[#141519] fill-[#141519]" />
                <span>
                  Lv. {totalGlobalLevels} · {userProfile.roleTitle}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            {/* White Pill Search Bar */}
            <div className="relative flex-1 sm:flex-initial min-w-0">
              <Search className="w-4 h-4 text-[#8E95A2] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  if (e.target.value && activeTab === 'dashboard') {
                    setActiveTab('vault');
                  }
                }}
                placeholder="Buscar en Bóveda, Habilidades..."
                className="w-full sm:w-72 h-11 pl-10 pr-4 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] text-[0.84rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519] shadow-[0_2px_10px_-2px_rgba(20,21,25,0.04)]"
              />
            </div>

            {/* Single Unified Charcoal Button with Sparkles for AI Assistant */}
            <button
              type="button"
              onClick={() => setIsAssistantOpen(true)}
              title="Abrir Aether Assistant (Function Calling)"
              className="h-11 px-4 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.82rem] font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs ring-1 ring-white/10"
            >
              <Sparkles className="w-4 h-4 text-[#A8E6E3]" />
              <span>Asistente IA</span>
            </button>
          </div>
        </section>

        {/* Notification Toast */}
        {toastBanner && (
          <div className="mb-5 px-4 py-2.5 rounded-full bg-[#141519] text-white text-[0.8rem] font-semibold flex items-center justify-between max-w-md mx-auto shadow-floating-dock border border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#6CD4CE]" />
              <span>{toastBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastBanner(null)}
              className="text-xs text-[#A0A6B2] hover:text-white ml-4 cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {/* ====================================================================
            MAIN VIEWPORT: ASYMMETRIC BENTO DASHBOARD OR ACTIVE MODULE VIEW
        ==================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* ----------------------------------------------------------------
                0. WIDGET DE RESUMEN DIARIO (VIVID GRADIENT + SPRING EXPANDABLE DAILY BRIEF)
            ---------------------------------------------------------------- */}
            <div
              className={`lg:col-span-12 rounded-[26px] bg-[#FFFFFF] border border-[#EEF1F5] shadow-bento overflow-hidden transition-all duration-500 ${
                isDailyBriefExpanded ? 'p-1.5' : 'p-0'
              }`}
            >
              {/* Cabecera / Contenedor Contraído con Degradado Dinámico Vivo y Shimmer en bucle */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isDailyBriefExpanded}
                onClick={() => setIsDailyBriefExpanded((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsDailyBriefExpanded((prev) => !prev);
                  }
                }}
                className={`daily-brief-vivid-header keep-dark-text cursor-pointer select-none group px-5 py-4 transition-all duration-500 ${
                  isDailyBriefExpanded ? 'rounded-[22px]' : 'rounded-[26px]'
                }`}
              >
                {/* Haz de brillo sutil en bucle (Shimmer Sweep) */}
                <div className="daily-brief-shimmer-beam" aria-hidden="true" />

                {/* Acento de luz radial carbón/lavanda sutil en la esquina derecha */}
                <div
                  className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full opacity-35 blur-2xl"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(20,21,25,0.22) 0%, rgba(155,169,240,0.25) 55%, transparent 75%)',
                  }}
                  aria-hidden="true"
                />

                <div className="relative z-10 flex items-center justify-between gap-3.5">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Icono principal en contenedor carbón con destello menta */}
                    <div className="w-11 h-11 rounded-[16px] bg-[#141519] text-[#A8E6E3] border border-white/40 flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105">
                      <Sparkles className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#141519] text-[#FFFFFF] text-[0.65rem] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                          <Sun className="w-3 h-3 text-[#A8E6E3]" />
                          Daily Brief
                        </span>

                        <h2 className="text-[1.05rem] sm:text-[1.12rem] font-bold tracking-[-0.02em] text-[#141519] keep-dark-text truncate">
                          {timeOfDayGreeting}, {userProfile.name}
                        </h2>

                        <span className="px-2.5 py-0.5 rounded-full bg-white/65 backdrop-blur-md border border-white/80 text-[#141519] keep-dark-text text-[0.68rem] font-semibold tabular-nums">
                          {new Date().toLocaleDateString('es-ES', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          ·{' '}
                          {new Date().toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-[0.78rem] font-semibold text-[#141519]/80 keep-dark-text truncate mt-1 tabular-nums">
                        {pendingDailyTasks.length}{' '}
                        {pendingDailyTasks.length === 1 ? 'tarea' : 'tareas'} ·{' '}
                        {dashboardScheduleBlocks.length}{' '}
                        {dashboardScheduleBlocks.length === 1
                          ? 'evento'
                          : 'eventos'}{' '}
                        · {nearestHypeRadarItems.length} en Hype Radar
                      </p>
                    </div>
                  </div>

                  {/* Píldoras de estado rápido + Botón Chevron con transición Spring */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden md:flex items-center gap-1.5">
                      <span className="px-3 py-1 rounded-full bg-white/75 backdrop-blur-md border border-white/90 text-[0.7rem] font-bold text-[#141519] keep-dark-text inline-flex items-center gap-1.5 tabular-nums shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-[#141519]" />
                        {pendingDailyTasks.length} pendientes
                      </span>
                      {nearestHypeRadarItems.length > 0 && (
                        <span className="px-3 py-1 rounded-full bg-[#141519]/90 text-white text-[0.7rem] font-bold inline-flex items-center gap-1.5 tabular-nums shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-[#A8E6E3]" />
                          {nearestHypeRadarItems[0].countdown.daysRemaining}d estreno
                        </span>
                      )}
                    </div>

                    <span
                      className={`daily-brief-chevron-spring w-9 h-9 rounded-full flex items-center justify-center border ${
                        isDailyBriefExpanded
                          ? 'bg-[#141519] text-[#FFFFFF] border-[#141519] rotate-180 shadow-sm'
                          : 'bg-white/80 text-[#141519] keep-dark-text border-white group-hover:bg-[#141519] group-hover:text-[#FFFFFF] group-hover:border-[#141519]'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Panel Desplegable con transición tipo Muelle (Spring ease-in-out) */}
              <div
                className={`grid daily-brief-spring-collapse ${
                  isDailyBriefExpanded
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pt-4 pb-3.5">
                    <div className="flex items-center justify-between gap-2 mb-3.5 flex-wrap">
                      <span className="text-[0.72rem] font-bold text-[#6E7480] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#6CD4CE]" />
                        Panorama interactivo del día
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('calendar')}
                          className="h-7 px-3 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.72rem] font-semibold text-[#141519] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CalendarIcon className="w-3 h-3" />
                          <span>Ver Agenda</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAssistantOpen(true)}
                          className="h-7 px-3 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.72rem] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-[#A8E6E3]" />
                          <span>Planificar con IA</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. Tareas Pendientes del Día */}
                      <div className="rounded-[20px] p-4 bg-[#F7F9FB] border border-[#EEF1F5] flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="text-[0.8rem] font-bold text-[#141519] flex items-center gap-1.5">
                              <CheckSquare className="w-3.5 h-3.5 text-[#141519]" />
                              Tareas Pendientes
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.68rem] font-bold tabular-nums">
                              {pendingDailyTasks.length}
                            </span>
                          </div>

                          {pendingDailyTasks.length === 0 ? (
                            <div className="py-3 text-center">
                              <p className="text-[0.76rem] font-medium text-[#8E95A2] mb-2">
                                No tienes tareas pendientes para hoy.
                              </p>
                              <button
                                type="button"
                                onClick={() => setActiveTab('calendar')}
                                className="px-3 py-1 rounded-full bg-[#FFFFFF] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.7rem] font-bold text-[#141519] cursor-pointer"
                              >
                                + Añadir tarea
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {pendingDailyTasks.slice(0, 3).map((task) => (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => handleToggleGoogleTask(task)}
                                  className="w-full p-2.5 rounded-[14px] bg-[#FFFFFF] hover:bg-[#A8E6E3]/25 border border-[#EEF1F5] flex items-center gap-2.5 text-left transition-colors cursor-pointer"
                                >
                                  <span className="w-4 h-4 rounded-full border-2 border-[#141519] flex items-center justify-center shrink-0" />
                                  <span className="text-[0.78rem] font-semibold text-[#141519] truncate">
                                    {task.title}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab('calendar')}
                          className="mt-3 text-[0.72rem] font-bold text-[#6E7480] hover:text-[#141519] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Gestionar tareas</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 2. Eventos Próximos del Cronograma */}
                      <div className="rounded-[20px] p-4 bg-[#F7F9FB] border border-[#EEF1F5] flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="text-[0.8rem] font-bold text-[#141519] flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-[#141519]" />
                              Próximos Eventos
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FFFFFF] border border-[#EEF1F5] text-[0.68rem] font-bold text-[#141519] tabular-nums">
                              {dashboardScheduleBlocks.length}
                            </span>
                          </div>

                          {dashboardScheduleBlocks.length === 0 ? (
                            <div className="py-3 text-center">
                              <p className="text-[0.76rem] font-medium text-[#8E95A2] mb-2">
                                Tu cronograma de hoy está despejado.
                              </p>
                              <button
                                type="button"
                                onClick={() => setCreateModalMode('schedule')}
                                className="px-3 py-1 rounded-full bg-[#FFFFFF] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.7rem] font-bold text-[#141519] cursor-pointer"
                              >
                                + Agendar bloque
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {dashboardScheduleBlocks.slice(0, 2).map((block) => (
                                <div
                                  key={block.id}
                                  onClick={() => setActiveTab('calendar')}
                                  className="p-2.5 rounded-[14px] bg-[#FFFFFF] border border-[#EEF1F5] flex items-center justify-between gap-2 cursor-pointer hover:border-[#141519]/30 transition-colors"
                                >
                                  <div className="min-w-0">
                                    <p className="text-[0.78rem] font-bold text-[#141519] truncate">
                                      {block.title}
                                    </p>
                                    <p className="text-[0.68rem] font-medium text-[#6E7480] tabular-nums">
                                      {block.time}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[0.66rem] font-bold shrink-0 ${
                                      block.accent === 'lavender'
                                        ? 'bg-[#BBC6F8] text-[#141519] keep-dark-text'
                                        : 'bg-[#A8E6E3] text-[#141519] keep-dark-text'
                                    }`}
                                  >
                                    {block.completion === 100 ? 'Listo' : 'Hoy'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setCreateModalMode('schedule')}
                          className="mt-3 text-[0.72rem] font-bold text-[#6E7480] hover:text-[#141519] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>+ Nuevo evento</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 3. Recordatorio Rápido del Hype Radar */}
                      <div className="rounded-[20px] p-4 bg-[#F7F9FB] border border-[#EEF1F5] flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="text-[0.8rem] font-bold text-[#141519] flex items-center gap-1.5">
                              <Film className="w-3.5 h-3.5 text-[#141519]" />
                              Hype Radar Cercano
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text text-[0.68rem] font-bold tabular-nums">
                              {nearestHypeRadarItems.length}
                            </span>
                          </div>

                          {nearestHypeRadarItems.length === 0 ? (
                            <div className="py-3 text-center">
                              <p className="text-[0.76rem] font-medium text-[#8E95A2] mb-2">
                                Sin estrenos próximos en seguimiento.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingVaultItem(null);
                                  setDefaultVaultGroup('proximamente');
                                  setCreateModalMode('vault');
                                }}
                                className="px-3 py-1 rounded-full bg-[#FFFFFF] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.7rem] font-bold text-[#141519] cursor-pointer"
                              >
                                + Añadir estreno
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {nearestHypeRadarItems.map(({ item, countdown }) => (
                                <div
                                  key={item.id}
                                  onClick={() => setActiveTab('vault')}
                                  className="p-2 rounded-[14px] bg-[#FFFFFF] border border-[#EEF1F5] flex items-center justify-between gap-2.5 cursor-pointer hover:border-[#BBC6F8] transition-colors"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-9 rounded-[10px] overflow-hidden shrink-0 border border-[#EEF1F5]">
                                      <VisualArtwork
                                        variant={item.artVariant}
                                        accent={item.accent}
                                        imageUrl={item.imageUrl}
                                        alt={item.title}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[0.78rem] font-bold text-[#141519] truncate">
                                        {item.title}
                                      </p>
                                      <p className="text-[0.66rem] font-medium text-[#6E7480] truncate">
                                        {countdown.formattedDate}
                                      </p>
                                    </div>
                                  </div>

                                  <span className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.66rem] font-bold tabular-nums shrink-0">
                                    {countdown.isFuture
                                      ? `${countdown.daysRemaining}d`
                                      : 'Estrenado'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab('vault')}
                          className="mt-3 text-[0.72rem] font-bold text-[#6E7480] hover:text-[#141519] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Ver Hype Radar</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ----------------------------------------------------------------
                1. HABILIDADES EN CURSO (ONGOING SKILLS - 7 COLS)
            ---------------------------------------------------------------- */}
            <div className="lg:col-span-7 bg-white rounded-[24px] p-5 sm:p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
              <div>
                <BentoHeader
                  icon={<Flame className="w-4 h-4" />}
                  title="Habilidades & Metas en Curso"
                  countBadge={`${skills.length} Activas`}
                  rightSlot={
                    <>
                      <button
                        type="button"
                        onClick={() => setCreateModalMode('skill')}
                        title="Nueva habilidad o deporte"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('skills')}
                        className="h-8 px-3 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.75rem] font-semibold text-[#141519] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <span>Árbol RPG</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  }
                />

                {skills.length === 0 ? (
                  <SoftBentoEmptyState
                    icon={<Flame className="w-5 h-5" />}
                    title="Tu Árbol de Habilidades & Deporte está listo"
                    description="Crea tu primera tarjeta de estudio o de Básquet y Fútbol para registrar entrenamientos y XP en Firebase."
                    actionLabel="+ Crear primera Habilidad"
                    onAction={() => setCreateModalMode('skill')}
                    onAskAssistant={() => setIsAssistantOpen(true)}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {skills.slice(0, 2).map((skill) => (
                      <PastelSkillCard
                        key={skill.id}
                        skill={skill}
                        onAddHour={handleAddSkillHours}
                        onDelete={requestDeleteSkill}
                        onSelect={() => setActiveTab('skills')}
                      />
                    ))}
                  </div>
                )}
              </div>

              {skills.length > 2 && (
                <div className="mt-4 pt-4 border-t border-[#EEF1F5] grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {skills.slice(2, 4).map((skill) => (
                    <div
                      key={skill.id}
                      onClick={() => setActiveTab('skills')}
                      className="p-3.5 rounded-[16px] bg-[#F7F9FB] hover:bg-[#EBF0F5]/60 border border-[#EEF1F5] flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.82rem] font-bold text-[#141519] truncate">
                            {skill.name}
                          </span>
                        </div>
                        <span className="text-[0.72rem] font-medium text-[#6E7480] tabular-nums">
                          Lv. {skill.level} ·{' '}
                          {skill.branch === 'sports'
                            ? `${skill.hoursInvested} entrenamientos`
                            : `${skill.hoursInvested}h`}{' '}
                          · {skill.progress}%
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddSkillHours(skill.id, 1);
                        }}
                        className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.7rem] font-semibold shrink-0 cursor-pointer tabular-nums"
                      >
                        {skill.branch === 'sports' ? '+1 Entreno' : '+1h'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ----------------------------------------------------------------
                2. HYPE RADAR · PRÓXIMOS ESTRENOS (5 COLS)
            ---------------------------------------------------------------- */}
            <div className="lg:col-span-5 bg-white rounded-[24px] p-5 sm:p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
              <div>
                <BentoHeader
                  icon={<Compass className="w-4 h-4" />}
                  title="Hype Radar"
                  countBadge={`${nearestHypeRadarItems.length} Próximos`}
                  rightSlot={
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVaultItem(null);
                          setDefaultVaultGroup('proximamente');
                          setCreateModalMode('vault');
                        }}
                        title="Añadir estreno al Hype Radar"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('vault')}
                        className="h-8 px-3 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.75rem] font-semibold text-[#141519] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <span>Ver todos</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  }
                />

                {nearestHypeRadarItems.length === 0 ? (
                  <SoftBentoEmptyState
                    icon={<Film className="w-5 h-5" />}
                    title="Tu Hype Radar está listo"
                    description="Registra próximos estrenos de cine, series o temporadas para seguir su cuenta regresiva."
                    actionLabel="+ Añadir próximo estreno"
                    onAction={() => {
                      setEditingVaultItem(null);
                      setDefaultVaultGroup('proximamente');
                      setCreateModalMode('vault');
                    }}
                    onAskAssistant={() => setIsAssistantOpen(true)}
                    compact
                  />
                ) : (
                  <div className="space-y-3">
                    {nearestHypeRadarItems.map(({ item, countdown }, idx) => {
                      const hypePct = Math.min(
                        100,
                        Math.max(0, Number(item.hypeLevel ?? 95))
                      );
                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveTab('vault')}
                          className="p-3.5 rounded-[20px] bg-lavender-gradient border-2 border-white/75 text-[#141519] keep-dark-text cursor-pointer transition-transform hover:scale-[1.01] shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-3 mb-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-12 rounded-[14px] overflow-hidden shrink-0 border border-white/80 bg-white">
                                <VisualArtwork
                                  variant={item.artVariant}
                                  accent={item.accent}
                                  imageUrl={item.imageUrl}
                                  alt={item.title}
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#141519]/75 block">
                                  Estreno · {countdown.formattedDate}
                                </span>
                                <h3 className="text-[0.95rem] font-bold text-[#141519] truncate">
                                  {item.title}
                                </h3>
                              </div>
                            </div>

                            <span
                              className={`px-3 py-1 rounded-full text-[0.72rem] font-bold tabular-nums shrink-0 ${
                                idx === 0
                                  ? 'bg-[#141519] text-white'
                                  : 'bg-white/80 text-[#141519]'
                              }`}
                            >
                              {countdown.isFuture
                                ? `Faltan ${countdown.daysRemaining}d`
                                : 'Estrenado'}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[0.68rem] font-bold text-[#141519]/80 mb-1 tabular-nums">
                              <span>Nivel de Hype</span>
                              <span>{hypePct}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/40 overflow-hidden p-0.5">
                              <div
                                className="h-full rounded-full bg-[#FFFFFF] transition-all duration-500"
                                style={{ width: `${hypePct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3.5 border-t border-[#EEF1F5] flex items-center justify-between text-[0.72rem] font-semibold text-[#6E7480]">
                <span>Radar de estrenos</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingVaultItem(null);
                    setDefaultVaultGroup('proximamente');
                    setCreateModalMode('vault');
                  }}
                  className="text-[#141519] font-bold hover:underline cursor-pointer"
                >
                  + Programar estreno
                </button>
              </div>
            </div>

            {/* ================================================================
                SECOND ROW: 3 ASYMMETRIC COLUMNS (25% / 30% / 45% IN DESKTOP)
            ================================================================ */}
            <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-[25fr_30fr_45fr] gap-4 sm:gap-5 items-stretch">
              {/* --------------------------------------------------------------
                  COLUMNA 1 (25%) — BÓVEDA RECIENTE (ESTILO LISTA LIMPIA)
              -------------------------------------------------------------- */}
              <div className="bg-[#FFFFFF] rounded-[24px] p-5 sm:p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519] shrink-0">
                        <Film className="w-4 h-4" />
                      </div>
                      <h2 className="text-[1.02rem] font-bold tracking-[-0.01em] text-[#141519] truncate">
                        Bóveda Reciente
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVaultItem(null);
                          setCreateModalMode('vault');
                        }}
                        title="Registrar obra en Bóveda"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('vault')}
                        title="Abrir Bóveda completa"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Buscador interno tipo píldora gris claro (#F7F9FB) */}
                  <div className="relative mb-4">
                    <Search className="w-3.5 h-3.5 text-[#8E95A2] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={vaultMiniSearch}
                      onChange={(e) => setVaultMiniSearch(e.target.value)}
                      placeholder="Buscar en bóveda..."
                      className="w-full h-9 pl-9 pr-3.5 rounded-full bg-[#F7F9FB] border border-[#EEF1F5] text-[0.78rem] text-[#141519] placeholder:text-[#A0A6B2] focus:outline-none focus:border-[#141519]"
                    />
                  </div>

                  {filteredVaultRecents.length === 0 ? (
                    <SoftBentoEmptyState
                      icon={<Film className="w-5 h-5" />}
                      title="Tu Bóveda está lista"
                      description="Registra tu primera película, serie, canción o persona."
                      actionLabel="+ Agregar a Bóveda"
                      onAction={() => {
                        setEditingVaultItem(null);
                        setCreateModalMode('vault');
                      }}
                      compact
                    />
                  ) : (
                    <div className="space-y-2.5">
                      {filteredVaultRecents.map((item, idx) => {
                        const isMintDot = idx % 2 === 0;
                        const isUpcoming = item.vaultGroup === 'proximamente';
                        const countdownInfo = isUpcoming
                          ? getAccurateHypeCountdown(
                              item.releaseDate,
                              item.daysRemaining
                            )
                          : null;
                        const hypePct = Math.min(
                          100,
                          Math.max(0, Number(item.hypeLevel ?? 95))
                        );

                        return (
                          <div
                            key={item.id}
                            onClick={() => setActiveTab('vault')}
                            className={`p-2.5 rounded-[16px] hover:bg-[#F7F9FB] border transition-all cursor-pointer ${
                              isUpcoming
                                ? 'bg-[#F7F9FB]/75 border-[#EEF1F5] flex flex-col gap-2'
                                : 'border-transparent hover:border-[#EEF1F5] flex items-center justify-between gap-2.5'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`${
                                    isUpcoming ? 'w-10 h-13' : 'w-10 h-10'
                                  } rounded-[12px] overflow-hidden shrink-0 border border-[#EEF1F5] bg-[#FFFFFF]`}
                                >
                                  <VisualArtwork
                                    variant={item.artVariant}
                                    accent={item.accent}
                                    imageUrl={item.imageUrl}
                                    alt={item.title}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-[0.84rem] font-bold text-[#141519] truncate">
                                    {item.title}
                                  </h3>
                                  <div className="flex items-center gap-1.5 text-[0.72rem] font-medium text-[#6E7480] mt-0.5">
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        isUpcoming
                                          ? 'bg-[#9BA9F0]'
                                          : isMintDot
                                          ? 'bg-[#6CD4CE]'
                                          : 'bg-[#9BA9F0]'
                                      }`}
                                    />
                                    <span className="truncate">
                                      {isUpcoming
                                        ? `Estreno: ${countdownInfo?.formattedDate}`
                                        : `${item.category} · Tier ${item.tier}`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isUpcoming ? (
                                  <span
                                    className={`px-2.5 py-1 rounded-full text-[0.68rem] font-bold tabular-nums whitespace-nowrap ${
                                      idx % 2 === 0
                                        ? 'bg-[#BBC6F8] text-[#141519] keep-dark-text'
                                        : 'bg-[#141519] text-white'
                                    }`}
                                  >
                                    {countdownInfo?.isFuture
                                      ? `Faltan ${countdownInfo.daysRemaining}d`
                                      : 'Ya estrenada'}
                                  </span>
                                ) : (
                                  <>
                                    {item.imdbRating && (
                                      <span className="px-2 py-0.5 rounded-full bg-[#F5C518] text-[#141519] keep-dark-text text-[0.65rem] font-extrabold tabular-nums">
                                        IMDb {item.imdbRating}
                                      </span>
                                    )}
                                    <span className="px-2.5 py-1 rounded-full bg-[#141519] text-white text-[0.72rem] font-bold tabular-nums">
                                      {item.rating.toFixed(1)} ★
                                    </span>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditVault(item);
                                  }}
                                  title="Editar registro"
                                  aria-label="Editar registro"
                                  className="w-7 h-7 rounded-full bg-[#F7F9FB] hover:bg-[#141519] text-[#6E7480] hover:text-white border border-[#EEF1F5] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {isUpcoming && (
                              <div>
                                <div className="flex items-center justify-between text-[0.66rem] font-bold text-[#6E7480] mb-1 tabular-nums">
                                  <span>Nivel de Hype</span>
                                  <span className="text-[#141519]">
                                    {hypePct}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-striped-pattern border border-[#EEF1F5] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-lavender-gradient transition-all duration-300"
                                    style={{ width: `${hypePct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('vault')}
                  className="mt-4 w-full h-9 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[0.75rem] font-semibold text-[#6E7480] hover:text-[#141519] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Explorar Bóveda ({vault.length})</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* --------------------------------------------------------------
                  COLUMNA 2 (30%) — CALENDARIO COMPACTO (MATRIZ CIRCULAR)
              -------------------------------------------------------------- */}
              <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519] shrink-0">
                        <CalendarIcon className="w-4 h-4" />
                      </div>
                      <h2 className="text-[1.02rem] font-bold tracking-[-0.01em] text-[#141519] truncate">
                        Calendario
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="relative">
                        <select
                          aria-label="Seleccionar mes"
                          value={selectedMonth}
                          onChange={(e) => {
                            setSelectedMonth(e.target.value);
                            showNotification(
                              `Calendario visualizando ${e.target.value}`
                            );
                          }}
                          className="h-8 pl-3 pr-7 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[0.75rem] font-semibold text-[#141519] appearance-none cursor-pointer focus:outline-none"
                        >
                          <option value="Octubre">Octubre</option>
                          <option value="Noviembre">Noviembre</option>
                          <option value="Diciembre">Diciembre</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#6E7480] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveTab('calendar')}
                        title="Abrir vista completa de Calendario"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <CalendarMatrix
                    days={calendarDays}
                    selectedDay={selectedCalendarDay}
                    onSelectDay={setSelectedCalendarDay}
                  />
                </div>

                <div className="mt-5 pt-3.5 border-t border-[#EEF1F5] flex items-center justify-between text-[0.7rem] font-semibold text-[#6E7480]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#A8E6E3]" />
                    Habilidades
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#BBC6F8]" />
                    Hitos / Tareas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-striped-subtle border border-[#8E95A2]/40" />
                    Vacío
                  </span>
                </div>
              </div>

              {/* --------------------------------------------------------------
                  COLUMNA 3 (45%) — AGENDA DEL DÍA (TIMELINE HORIZONTAL SYNC)
              -------------------------------------------------------------- */}
              <div className="bg-[#FFFFFF] rounded-[24px] p-6 border border-[#EEF1F5] shadow-bento flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-[12px] bg-[#F7F9FB] border border-[#EEF1F5] flex items-center justify-center text-[#141519] shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <h2 className="text-[1.02rem] font-bold tracking-[-0.01em] text-[#141519] truncate">
                        Agenda del Día
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!hasGoogleToken && (
                        <button
                          type="button"
                          onClick={handleConnectGoogleWorkspace}
                          className="h-8 px-3 rounded-full bg-[#A8E6E3] text-[#141519] keep-dark-text text-[0.72rem] font-bold cursor-pointer"
                        >
                          Sync Google
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setCreateModalMode('schedule')}
                        title="Agendar nuevo bloque"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('calendar')}
                        title="Ver cronograma completo"
                        className="w-8 h-8 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] border border-[#EEF1F5] text-[#6E7480] hover:text-[#141519] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {dashboardScheduleBlocks.length > 0 && (
                    <div className="grid grid-cols-4 text-[0.68rem] font-semibold text-[#8E95A2] tabular-nums px-2 mb-1">
                      <span>09:00 am</span>
                      <span className="text-center text-[#141519] font-bold">
                        Ahora
                      </span>
                      <span className="text-center">04:00 pm</span>
                      <span className="text-right">08:00 pm</span>
                    </div>
                  )}

                  <TimelineSchedule
                    blocks={dashboardScheduleBlocks}
                    onToggleBlock={handleToggleScheduleBlock}
                    onDeleteBlock={requestDeleteScheduleBlock}
                    onOpenCreate={() => setCreateModalMode('schedule')}
                    onAskAssistant={() => setIsAssistantOpen(true)}
                    userInitials={userProfile.initials}
                  />
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#EEF1F5] flex items-center justify-between text-[0.72rem] font-semibold text-[#6E7480]">
                  <span>Día {selectedCalendarDay}</span>
                  <span className="text-[#141519] tabular-nums">
                    {schedule.length} eventos · {googleTasks.length} tareas
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DEDICATED MODULE TABS */}
        {activeTab === 'vault' && (
          <VaultView
            items={vault}
            globalQuery={globalSearch}
            onOpenCreate={(group) => {
              setEditingVaultItem(null);
              setDefaultVaultGroup(group || 'peliculas_series');
              setCreateModalMode('vault');
            }}
            onOpenAssistant={() => setIsAssistantOpen(true)}
            onEditItem={handleOpenEditVault}
            onDeleteItem={requestDeleteVaultItem}
            spotifyProfile={spotifyProfile}
            isConnectingSpotify={isConnectingSpotify}
            onConnectSpotify={() => handleConnectSpotify()}
            onSaveSpotifyItemToVault={handleCreateVault}
          />
        )}

        {activeTab === 'skills' && (
          <SkillsView
            skills={skills}
            onAddHour={handleAddSkillHours}
            onToggleMilestone={handleToggleMilestone}
            onAddMilestone={handleAddMilestone}
            onDeleteSkill={requestDeleteSkill}
            onOpenCreate={() => setCreateModalMode('skill')}
            onAskAssistant={() => setIsAssistantOpen(true)}
          />
        )}

        {activeTab === 'wishlist' && (
          <WishlistView
            items={wishlist}
            extraSavingsPool={extraSavingsPool}
            onUpdateSavingsPool={handleUpdateSavingsPool}
            onAddSavings={handleAddSavings}
            onTogglePurchased={handleTogglePurchased}
            onDeleteItem={requestDeleteWishlistItem}
            onOpenCreate={() => setCreateModalMode('wishlist')}
            onAskAssistant={() => setIsAssistantOpen(true)}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            calendarDays={calendarDays}
            selectedDay={selectedCalendarDay}
            onSelectDay={setSelectedCalendarDay}
            scheduleBlocks={schedule}
            onToggleBlock={handleToggleScheduleBlock}
            onDeleteBlock={requestDeleteScheduleBlock}
            onOpenCreateSchedule={() => setCreateModalMode('schedule')}
            googleTasks={googleTasks}
            onCreateGoogleTask={handleCreateGoogleTask}
            onToggleGoogleTask={handleToggleGoogleTask}
            onDeleteGoogleTask={requestDeleteGoogleTask}
            isGoogleConnected={hasGoogleToken}
            isSyncingGoogle={isSyncingGoogle}
            onConnectGoogle={handleConnectGoogleWorkspace}
            onRefreshGoogle={() => syncGoogleWorkspaceData()}
            onAskAssistant={() => setIsAssistantOpen(true)}
          />
        )}
      </div>

      {/* ======================================================================
          MOBILE FLOATING NAVIGATION DOCK (#141519 with active circle #A8E6E3)
      ====================================================================== */}
      <nav
        aria-label="Navegación móvil"
        className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#141519] text-white rounded-full p-1.5 px-2.5 shadow-floating-dock flex items-center gap-1.5 border border-white/10"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 rounded-full transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#A8E6E3] text-[#141519] keep-dark-text px-3.5 py-2 font-bold'
                  : 'w-10 h-10 justify-center text-[#A0A6B2] hover:text-white'
              }`}
            >
              {item.icon}
              {isActive && (
                <span className="text-[0.75rem] whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsAssistantOpen(true)}
          aria-label="Abrir Asistente IA"
          className="w-10 h-10 rounded-full bg-[#BBC6F8] text-[#141519] keep-dark-text flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </nav>

      {/* ======================================================================
          TRANSVERSAL MODULES: GEMINI ACTION HUB, CREATE MODAL, CONFIRM MODAL
      ====================================================================== */}
      <GeminiActionHub
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        skills={skills}
        vault={vault}
        wishlist={wishlist}
        extraSavingsPool={extraSavingsPool}
        schedule={schedule}
        isGoogleCalendarConnected={hasGoogleToken}
        isFirestoreConnected={Boolean(authUser)}
        conversations={assistantConversations}
        onSaveConversation={handleSaveAssistantConversation}
        onDeleteConversation={handleDeleteAssistantConversation}
        onExecuteAction={handleExecuteAiAction}
        onNavigateTab={setActiveTab}
      />

      <QuickCreateModal
        mode={createModalMode}
        defaultVaultGroup={defaultVaultGroup}
        editingVaultItem={editingVaultItem}
        onClose={() => {
          setEditingVaultItem(null);
          setCreateModalMode(null);
        }}
        onAddVault={handleCreateVault}
        onUpdateVault={handleUpdateVault}
        onAddSkill={handleCreateSkill}
        onAddWishlist={handleCreateWishlist}
        onAddSchedule={handleCreateSchedule}
      />

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={userProfile}
        onSaveProfile={(updated) => {
          setUserProfile(updated);
          showNotification(`Perfil de ${updated.name} actualizado`);
        }}
        stats={{
          totalLevel: totalGlobalLevels,
          totalHours: totalGlobalHours,
          vaultCount: vault.length,
          wishlistCount: wishlist.length,
        }}
        onExportData={handleExportBackup}
        spotifyProfile={spotifyProfile}
        isConnectingSpotify={isConnectingSpotify}
        onConnectSpotify={() => handleConnectSpotify()}
        onDisconnectSpotify={handleDisconnectSpotify}
      />

      {/* Modal limpio para ingresar SPOTIFY_CLIENT_ID si no está en .env */}
      {isSpotifyClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/40 backdrop-blur-xs">
          <div className="w-full max-w-[440px] bg-[#FFFFFF] rounded-[28px] p-6 border border-[#EEF1F5] shadow-floating-dock">
            <h3 className="text-[1.05rem] font-bold text-[#141519] mb-1.5">
              Conectar con Spotify (OAuth 2.0 PKCE)
            </h3>
            <p className="text-[0.78rem] font-medium text-[#6E7480] mb-4 leading-relaxed">
              Ingresa tu <strong>Spotify Client ID</strong> de Spotify Developer
              Dashboard para iniciar la autorización segura PKCE:
            </p>
            <input
              type="text"
              value={spotifyClientIdInput}
              onChange={(e) => setSpotifyClientIdInput(e.target.value)}
              placeholder="Ej: 4b9f8c2a1d3e..."
              className="w-full h-11 px-4 rounded-2xl bg-[#F7F9FB] border border-[#EEF1F5] focus:border-[#141519] text-[0.84rem] text-[#141519] mb-3 focus:outline-none"
            />
            <p className="text-[0.7rem] text-[#8E95A2] mb-5">
              Redirect URI:{' '}
              <code className="text-[#141519] font-semibold">
                {window.location.origin}/auth/spotify/callback
              </code>
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSpotifyClientModalOpen(false)}
                className="h-10 px-4 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[0.8rem] font-semibold text-[#6E7480] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const clean = spotifyClientIdInput.trim();
                  if (!clean) return;
                  setStoredSpotifyClientId(clean);
                  setIsSpotifyClientModalOpen(false);
                  handleConnectSpotify(clean);
                }}
                className="h-10 px-5 rounded-full bg-[#1DB954] hover:bg-[#1aa34a] text-[#141519] keep-dark-text text-[0.8rem] font-bold cursor-pointer"
              >
                Autorizar en Spotify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Operation Confirmation Dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141519]/40 backdrop-blur-xs">
          <div className="w-full max-w-[400px] bg-[#FFFFFF] rounded-[28px] p-6 border border-[#EEF1F5] shadow-floating-dock">
            <div className="w-11 h-11 rounded-[14px] bg-[#F28B82]/30 text-[#141519] flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-[1.05rem] font-bold text-[#141519] mb-1.5">
              {pendingDelete.title}
            </h3>
            <p className="text-[0.82rem] font-medium text-[#6E7480] mb-6 leading-relaxed">
              {pendingDelete.subtitle}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-10 px-4 rounded-full bg-[#F7F9FB] hover:bg-[#EBF0F5] text-[0.8rem] font-semibold text-[#6E7480] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirmFn = pendingDelete.onConfirm;
                  setPendingDelete(null);
                  await confirmFn();
                }}
                className="h-10 px-5 rounded-full bg-[#141519] hover:bg-[#2A2C34] text-white text-[0.8rem] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-[#F28B82]" />
                <span>Confirmar Eliminación</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
