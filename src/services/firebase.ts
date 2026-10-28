import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DailyActivity,
  SkillItem,
  VaultItem,
  WishlistItem,
} from '../types/lifeOs';

// Initialize Firebase using the provisioned firebase-applet-config.json
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Google OAuth 2.0 Scopes for Google Calendar and Google Tasks
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({
  prompt: 'consent',
});

// In-memory cache for Google Workspace OAuth access token (never stored in localStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Test connection to Firestore on boot per firebase-integration-rpc
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const initAuth = (
  onAuthChange: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      onAuthChange(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
      }
      onAuthChange(null, null);
    }
  });
};

export const googleSignInWithWorkspace = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const logoutFirebase = async () => {
  cachedAccessToken = null;
  await auth.signOut();
};

// Helper to strip undefined keys and enforce blueprint string/array limits
function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) {
      cleaned[k] = v;
    }
  });
  return cleaned as T;
}

const clampStr = (val: string | undefined, max: number, fallback = '') =>
  (val ?? fallback).slice(0, max);

/* ============================================================================
   1. COLLECTION: `vault_items`
============================================================================ */
export function sanitizeVaultPayload(
  userId: string,
  item: Omit<VaultItem, 'id'>,
  existingCreatedAt?: string
) {
  const payload: Record<string, any> = {
    userId: clampStr(userId, 128),
    title: clampStr(item.title || 'Sin título', 200),
    creator: clampStr(item.creator || 'Desconocido', 200),
    category: clampStr(item.category || 'Cine', 60),
    vaultGroup: [
      'peliculas_series',
      'proximamente',
      'musica',
      'videos',
      'personas',
      'momentos',
    ].includes(item.vaultGroup)
      ? item.vaultGroup
      : 'peliculas_series',
    rating: Math.min(10, Math.max(0, Number(item.rating) || 9.0)),
    tier: ['S', 'A', 'B'].includes(item.tier) ? item.tier : 'S',
    consumedDate: clampStr(item.consumedDate || 'Hoy', 60),
    tags: (item.tags || []).slice(0, 10).map((t) => clampStr(String(t), 100)),
    review: clampStr(item.review || '', 1500),
    accent: item.accent === 'lavender' ? 'lavender' : 'mint',
    artVariant: clampStr(item.artVariant || 'cinema', 40),
    createdAt: clampStr(
      existingCreatedAt || item.createdAt || new Date().toISOString(),
      60
    ),
  };

  if (typeof item.isFeaturedMasterpiece === 'boolean') {
    payload.isFeaturedMasterpiece = item.isFeaturedMasterpiece;
  }
  if (item.imageUrl) payload.imageUrl = clampStr(item.imageUrl, 1000);
  if (item.audioPreviewUrl) {
    payload.audioPreviewUrl = clampStr(item.audioPreviewUrl, 1000);
  }
  if (item.releaseYear) payload.releaseYear = clampStr(item.releaseYear, 20);
  if (item.imdbId) payload.imdbId = clampStr(item.imdbId, 30);
  if (item.imdbRating) payload.imdbRating = clampStr(item.imdbRating, 20);
  if (item.imdbVotes) payload.imdbVotes = clampStr(item.imdbVotes, 40);
  if (item.actors) payload.actors = clampStr(item.actors, 400);
  if (item.plot) payload.plot = clampStr(item.plot, 1500);
  if (item.releaseDate) payload.releaseDate = clampStr(item.releaseDate, 60);
  if (typeof item.daysRemaining === 'number' && !isNaN(item.daysRemaining)) {
    payload.daysRemaining = Math.min(3650, Math.max(0, item.daysRemaining));
  }
  if (typeof item.hypeLevel === 'number' && !isNaN(item.hypeLevel)) {
    payload.hypeLevel = Math.min(100, Math.max(0, item.hypeLevel));
  }
  if (item.releaseFormat) {
    payload.releaseFormat = clampStr(item.releaseFormat, 100);
  }
  if (item.duration) payload.duration = clampStr(item.duration, 30);
  if (item.videoUrl) payload.videoUrl = clampStr(item.videoUrl, 500);
  if (item.keyTakeaway) payload.keyTakeaway = clampStr(item.keyTakeaway, 600);
  if (item.relationshipTag) {
    payload.relationshipTag = clampStr(item.relationshipTag, 40);
  }
  if (item.personMeta) payload.personMeta = clampStr(item.personMeta, 200);
  if (item.personInitials) {
    payload.personInitials = clampStr(item.personInitials, 6);
  }
  if (item.location) payload.location = clampStr(item.location, 150);

  return cleanUndefined(payload);
}

export function subscribeVaultItems(
  userId: string,
  onData: (items: VaultItem[]) => void
) {
  const q = query(
    collection(db, 'vault_items'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: VaultItem[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<VaultItem, 'id'>),
        id: d.id,
      }));
      list.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vault_items');
    }
  );
}

export async function createVaultItemDoc(
  userId: string,
  item: Omit<VaultItem, 'id'>
): Promise<string> {
  const payload = sanitizeVaultPayload(userId, item);
  try {
    const ref = await addDoc(collection(db, 'vault_items'), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'vault_items');
  }
}

export async function updateVaultItemDoc(
  userId: string,
  itemId: string,
  item: VaultItem
): Promise<void> {
  const payload = sanitizeVaultPayload(userId, item, item.createdAt);
  try {
    await updateDoc(doc(db, 'vault_items', itemId), payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `vault_items/${itemId}`
    );
  }
}

export async function deleteVaultItemDoc(itemId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'vault_items', itemId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `vault_items/${itemId}`
    );
  }
}

/* ============================================================================
   2. COLLECTION: `skills_rpg`
============================================================================ */
export function sanitizeSkillPayload(
  userId: string,
  skill: Omit<SkillItem, 'id'>,
  existingCreatedAt?: string
) {
  const payload: Record<string, any> = {
    userId: clampStr(userId, 128),
    name: clampStr(skill.name || 'Habilidad', 200),
    category: clampStr(skill.category || 'Desarrollo Personal', 100),
    branch: skill.branch === 'sports' ? 'sports' : 'learning',
    unitLabel:
      skill.unitLabel === 'Entrenamientos' || skill.branch === 'sports'
        ? 'Entrenamientos'
        : 'h',
    level: Math.min(999, Math.max(1, Math.round(Number(skill.level) || 1))),
    progress: Math.min(
      100,
      Math.max(0, Math.round(Number(skill.progress) || 0))
    ),
    hoursInvested: Math.min(
      100000,
      Math.max(0, Number(skill.hoursInvested) || 0)
    ),
    weeklyTargetHours: Math.min(
      168,
      Math.max(0, Number(skill.weeklyTargetHours) || 5)
    ),
    accent: skill.accent === 'lavender' ? 'lavender' : 'mint',
    iconName: clampStr(skill.iconName || 'sparkles', 40),
    tags: (skill.tags || []).slice(0, 10).map((t) => clampStr(String(t), 100)),
    milestones: (skill.milestones || []).slice(0, 50).map((m) =>
      cleanUndefined({
        id: clampStr(m.id || `m-${Date.now()}`, 80),
        title: clampStr(m.title || 'Hito', 200),
        unlocked: Boolean(m.unlocked),
        date: m.date ? clampStr(m.date, 40) : undefined,
        badge: m.badge ? clampStr(m.badge, 40) : undefined,
      })
    ),
    createdAt: clampStr(
      existingCreatedAt || skill.createdAt || new Date().toISOString(),
      60
    ),
  };

  if (skill.sportStats) {
    payload.sportStats = clampStr(skill.sportStats, 200);
  }

  return cleanUndefined(payload);
}

export function subscribeSkillsRpg(
  userId: string,
  onData: (skills: SkillItem[]) => void
) {
  const q = query(collection(db, 'skills_rpg'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: SkillItem[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<SkillItem, 'id'>),
        id: d.id,
      }));
      list.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'skills_rpg');
    }
  );
}

export async function createSkillRpgDoc(
  userId: string,
  skill: Omit<SkillItem, 'id'>
): Promise<string> {
  const payload = sanitizeSkillPayload(userId, skill);
  try {
    const ref = await addDoc(collection(db, 'skills_rpg'), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'skills_rpg');
  }
}

export async function updateSkillRpgDoc(
  userId: string,
  skillId: string,
  skill: SkillItem
): Promise<void> {
  const payload = sanitizeSkillPayload(userId, skill, skill.createdAt);
  try {
    await updateDoc(doc(db, 'skills_rpg', skillId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `skills_rpg/${skillId}`);
  }
}

export async function deleteSkillRpgDoc(skillId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'skills_rpg', skillId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `skills_rpg/${skillId}`);
  }
}

/* ============================================================================
   3. COLLECTION: `wishlist_items` & `wishlist_settings/{userId}`
============================================================================ */
export function sanitizeWishlistPayload(
  userId: string,
  item: Omit<WishlistItem, 'id'>,
  existingCreatedAt?: string
) {
  const validTag = [
    'Tech',
    'Deporte / Básquet & Fútbol',
    'Setup',
    'Caprichos',
  ].includes(item.wishlistTag || '')
    ? item.wishlistTag!
    : 'Tech';

  const payload = {
    userId: clampStr(userId, 128),
    name: clampStr(item.name || 'Producto', 200),
    category: clampStr(item.category || validTag, 100),
    wishlistTag: validTag,
    estimatedPrice: Math.min(
      1000000,
      Math.max(1, Number(item.estimatedPrice) || 100)
    ),
    savedAmount: Math.min(
      1000000,
      Math.max(0, Number(item.savedAmount) || 0)
    ),
    priority: ['Alta', 'Media', 'Capricho'].includes(item.priority)
      ? item.priority
      : 'Media',
    purchased: Boolean(item.purchased),
    link: clampStr(item.link || 'https://google.com', 500),
    notes: clampStr(item.notes || '', 1000),
    accent: item.accent === 'lavender' ? 'lavender' : 'mint',
    artVariant: clampStr(item.artVariant || 'keyboard', 40),
    createdAt: clampStr(
      existingCreatedAt || item.createdAt || new Date().toISOString(),
      60
    ),
  };

  return cleanUndefined(payload);
}

export function subscribeWishlistItems(
  userId: string,
  onData: (items: WishlistItem[]) => void
) {
  const q = query(
    collection(db, 'wishlist_items'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: WishlistItem[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<WishlistItem, 'id'>),
        id: d.id,
      }));
      list.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'wishlist_items');
    }
  );
}

export async function createWishlistItemDoc(
  userId: string,
  item: Omit<WishlistItem, 'id'>
): Promise<string> {
  const payload = sanitizeWishlistPayload(userId, item);
  try {
    const ref = await addDoc(collection(db, 'wishlist_items'), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'wishlist_items');
  }
}

export async function updateWishlistItemDoc(
  userId: string,
  itemId: string,
  item: WishlistItem
): Promise<void> {
  const payload = sanitizeWishlistPayload(userId, item, item.createdAt);
  try {
    await updateDoc(doc(db, 'wishlist_items', itemId), payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `wishlist_items/${itemId}`
    );
  }
}

export async function deleteWishlistItemDoc(itemId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'wishlist_items', itemId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `wishlist_items/${itemId}`
    );
  }
}

export function subscribeWishlistSettings(
  userId: string,
  onPoolChange: (pool: number) => void
) {
  const docRef = doc(db, 'wishlist_settings', userId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onPoolChange(Number(data.extraSavingsPool) || 0);
      } else {
        onPoolChange(0);
      }
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.GET,
        `wishlist_settings/${userId}`
      );
    }
  );
}

export async function saveWishlistSettingsDoc(
  userId: string,
  extraSavingsPool: number
): Promise<void> {
  const docRef = doc(db, 'wishlist_settings', userId);
  const payload = {
    userId: clampStr(userId, 128),
    extraSavingsPool: Math.min(
      10000000,
      Math.max(0, Number(extraSavingsPool) || 0)
    ),
    updatedAt: new Date().toISOString().slice(0, 60),
  };
  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `wishlist_settings/${userId}`
    );
  }
}

/* ============================================================================
   4. COLLECTION: `daily_hours`
============================================================================ */
export function subscribeDailyHours(
  userId: string,
  onData: (days: DailyActivity[]) => void
) {
  const q = query(collection(db, 'daily_hours'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyActivity[] = snapshot.docs.map((d) => ({
        ...(d.data() as DailyActivity),
        id: d.id,
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'daily_hours');
    }
  );
}

export async function upsertDailyHoursDoc(
  userId: string,
  day: DailyActivity
): Promise<void> {
  const dateKey =
    day.dateKey ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(day.dateNum).padStart(2, '0')}`;
  const docId = `${userId}_${dateKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const payload = {
    userId: clampStr(userId, 128),
    dayShort: clampStr(day.dayShort || 'Hoy', 20),
    dayLabel: clampStr(day.dayLabel || 'Hoy', 60),
    dateNum: Math.min(31, Math.max(1, Number(day.dateNum) || 1)),
    dateKey: clampStr(dateKey, 20),
    hours: Math.min(24, Math.max(0, Number(day.hours) || 0)),
    focusTopic: clampStr(day.focusTopic || 'Práctica Enfocada', 200),
    updatedAt: new Date().toISOString().slice(0, 60),
  };

  try {
    await setDoc(doc(db, 'daily_hours', docId), payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `daily_hours/${docId}`
    );
  }
}
