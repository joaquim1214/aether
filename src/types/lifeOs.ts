export type TabId = 'dashboard' | 'vault' | 'skills' | 'wishlist' | 'calendar';

export type VaultCategory =
  | 'Cine'
  | 'Serie'
  | 'Juego'
  | 'Libro'
  | 'Próximamente'
  | 'Música'
  | 'Video'
  | 'Persona'
  | 'Momento';

export type VaultFilterId =
  | 'todo'
  | 'peliculas_series'
  | 'proximamente'
  | 'musica'
  | 'videos'
  | 'personas'
  | 'momentos';

export type VaultTier = 'S' | 'A' | 'B';

export interface VaultItem {
  id: string;
  userId?: string;
  title: string;
  creator: string;
  category: VaultCategory;
  vaultGroup: Exclude<VaultFilterId, 'todo'>;
  rating: number; // 1.0 - 10.0
  tier: VaultTier;
  consumedDate: string;
  tags: string[];
  review: string;
  accent: 'mint' | 'lavender';
  artVariant:
    | 'cyberpunk'
    | 'rpg'
    | 'cinema'
    | 'book'
    | 'frieren'
    | 'synth'
    | 'camera'
    | 'japan'
    | 'display';
  isFeaturedMasterpiece?: boolean;
  imageUrl?: string;
  audioPreviewUrl?: string;
  releaseYear?: string;
  imdbId?: string;
  imdbRating?: string;
  imdbVotes?: string;
  actors?: string;
  plot?: string;
  releaseDate?: string;
  daysRemaining?: number;
  hypeLevel?: number;
  releaseFormat?: string;
  duration?: string;
  videoUrl?: string;
  keyTakeaway?: string;
  relationshipTag?: 'Amigo' | 'Referente' | 'Equipo' | 'Familia' | 'Mentor';
  personInitials?: string;
  personMeta?: string;
  location?: string;
  createdAt?: string;
}

export type SkillBranch = 'learning' | 'sports';

export interface SkillMilestone {
  id: string;
  title: string;
  unlocked: boolean;
  date?: string;
  badge?: string;
}

export interface SkillItem {
  id: string;
  userId?: string;
  name: string;
  category: string;
  branch?: SkillBranch;
  level: number;
  progress: number; // 0 - 100
  hoursInvested: number;
  weeklyTargetHours: number;
  unitLabel?: 'h' | 'Entrenamientos';
  sportStats?: string;
  accent: 'mint' | 'lavender';
  iconName:
    | 'layers'
    | 'cpu'
    | 'sparkles'
    | 'languages'
    | 'music'
    | 'dumbbell'
    | 'trophy'
    | 'target';
  tags: string[];
  milestones: SkillMilestone[];
  createdAt?: string;
}

export type WishlistPriority = 'Alta' | 'Media' | 'Capricho';
export type WishlistCategoryTag =
  | 'Tech'
  | 'Deporte / Básquet & Fútbol'
  | 'Setup'
  | 'Caprichos';

export interface WishlistItem {
  id: string;
  userId?: string;
  name: string;
  category: string;
  wishlistTag?: WishlistCategoryTag;
  estimatedPrice: number;
  savedAmount: number;
  priority: WishlistPriority;
  link: string;
  notes: string;
  accent: 'mint' | 'lavender';
  artVariant:
    | 'keyboard'
    | 'display'
    | 'synth'
    | 'chair'
    | 'camera'
    | 'japan'
    | 'rpg';
  purchased?: boolean;
  createdAt?: string;
}

export interface DailyActivity {
  id?: string;
  userId?: string;
  dayShort: string;
  dayLabel: string;
  dateNum: number;
  dateKey?: string;
  hours: number;
  focusTopic: string;
  isToday?: boolean;
}

export type CalendarDayState = 'empty' | 'normal' | 'mint' | 'lavender';

export interface CalendarDay {
  id: string;
  dayNumber: number | null;
  state: CalendarDayState;
  label?: string;
  eventsCount?: number;
}

export interface ScheduleBlock {
  id: string;
  title: string;
  time: string;
  dayOfMonth: number;
  completion: number; // 0 - 100
  category: 'Deep Work' | 'Skill' | 'Personal' | 'Sync';
  accent: 'mint' | 'lavender';
  syncedSource: 'Google Calendar' | 'Google Tasks';
  googleEventId?: string;
  googleTaskId?: string;
  htmlLink?: string;
  startIso?: string;
  endIso?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
  updated?: string;
}

export interface AssistantActionRecord {
  name: string;
  summary: string;
  targetModule: TabId;
  sourceBadge?:
    | 'Firestore · vault_items'
    | 'Firestore · skills_rpg'
    | 'Firestore · wishlist_items'
    | 'Firestore · wishlist_settings'
    | 'Google Calendar API'
    | 'Google Tasks API (@default)'
    | 'Bóveda Local'
    | 'Skills Local'
    | 'Wishlist Local'
    | 'Agenda Local'
    | 'Tasks Local'
    | string;
  accent?: 'mint' | 'lavender';
  details?: string;
  // Rich miniature Soft Bento Card preview fields
  itemType?: 'vault' | 'skill' | 'wishlist' | 'calendar' | 'task';
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  badgeText?: string;
  secondaryBadge?: string;
  progressPct?: number;
  progressLabel?: string;
  spotifyUrl?: string;
  audioPreviewUrl?: string;
  tags?: string[];
  createdVaultItem?: VaultItem;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: AssistantActionRecord[];
}
