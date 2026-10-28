/**
 * Firestore Security Rules Test Suite — Dirty Dozen Adversarial Verification
 * Validates that all 12 attack vectors defined in security_spec.md are rejected.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated Write (vault_items)',
    collection: 'vault_items',
    operation: 'create',
    auth: null,
    payload: { title: 'Spoof Movie' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof (vault_items)',
    collection: 'vault_items',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: false },
    payload: { userId: 'user-1', title: 'Movie' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User Identity Spoofing on Create (skills_rpg)',
    collection: 'skills_rpg',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-2', name: 'Spoofed Skill' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User Read (wishlist_items)',
    collection: 'wishlist_items',
    operation: 'get',
    auth: { uid: 'user-1', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow / Ghost Field Injection (vault_items)',
    collection: 'vault_items',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-1', title: 'Valid', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Ownership Transfer Attack on Update (skills_rpg)',
    collection: 'skills_rpg',
    operation: 'update',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-2' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable Timestamp Tampering (wishlist_items)',
    collection: 'wishlist_items',
    operation: 'update',
    auth: { uid: 'user-1', email_verified: true },
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Oversized String DoW Attack (vault_items)',
    collection: 'vault_items',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-1', title: 'A'.repeat(500) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unbounded Array Injection (skills_rpg)',
    collection: 'skills_rpg',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: {
      userId: 'user-1',
      tags: Array.from({ length: 25 }, (_, i) => `tag-${i}`),
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid Enum Poisoning (wishlist_items)',
    collection: 'wishlist_items',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-1', priority: 'Ultra' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Negative Price Out-of-Bounds (wishlist_items)',
    collection: 'wishlist_items',
    operation: 'create',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-1', estimatedPrice: -500 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Path ID Poisoning (wishlist_settings)',
    collection: 'wishlist_settings/user-2',
    operation: 'update',
    auth: { uid: 'user-1', email_verified: true },
    payload: { userId: 'user-1', extraSavingsPool: 999999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
