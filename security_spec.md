# Life OS — Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership (`userId == request.auth.uid`)**: Every document in `/vault_items/{itemId}`, `/skills_rpg/{skillId}`, `/wishlist_items/{itemId}`, `/wishlist_settings/{userId}`, and `/daily_hours/{dayId}` belongs exclusively to a single authenticated and email-verified user (`request.auth.uid`).
2. **Verified Identity**: All read and write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Immutable Ownership & Creation Metadata**: On `update`, `userId` and `createdAt` (where present) must never change (`incoming().userId == existing().userId`).
4. **Strict Key & Volumetric Boundaries**: Every string, number, boolean, and bounded array (`tags.size() <= 10`, `milestones.size() <= 50`) is validated in standalone `isValid[Entity]` functions on both `create` and `update`.
5. **Query Enforcer on List Operations**: Every `allow list` rule explicitly enforces `resource.data.userId == request.auth.uid`, preventing cross-user query scraping.

## 2. The "Dirty Dozen" Payloads (Adversarial Test Vectors)
1. **Unauthenticated Write (`vault_items`)**: `auth = null`, attempting to create a vault item -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof (`vault_items`)**: `auth.uid = 'u1', email_verified = false` -> `PERMISSION_DENIED`.
3. **Cross-User Identity Spoofing on Create (`skills_rpg`)**: `auth.uid = 'u1'`, payload `userId: 'u2'` -> `PERMISSION_DENIED`.
4. **Cross-User Read (`wishlist_items`)**: `auth.uid = 'u1'` attempting `get` or `list` on documents with `userId == 'u2'` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection (`vault_items`)**: Payload includes `isAdmin: true` or `unlistedField: 'hack'` not in `hasOnly` allowlist -> `PERMISSION_DENIED`.
6. **Ownership Transfer Attack on Update (`skills_rpg`)**: Updating `userId` from `'u1'` to `'u2'` -> `PERMISSION_DENIED`.
7. **Immutable Timestamp Tampering (`wishlist_items`)**: Modifying `createdAt` during an `update` -> `PERMISSION_DENIED`.
8. **Oversized String DoW Attack (`vault_items`)**: Sending a 50,000-char string in `review` (max 1500) or `title` (max 200) -> `PERMISSION_DENIED`.
9. **Unbounded Array Injection (`skills_rpg`)**: Sending 25 elements in `tags` (max 10) -> `PERMISSION_DENIED`.
10. **Invalid Enum Poisoning (`wishlist_items`)**: Setting `priority: 'Ultra'` instead of `['Alta', 'Media', 'Capricho']` -> `PERMISSION_DENIED`.
11. **Negative Price / Rating Out-of-Bounds (`wishlist_items` / `vault_items`)**: Setting `estimatedPrice: -500` or `rating: 99` -> `PERMISSION_DENIED`.
12. **Path ID Poisoning (`wishlist_settings/{userId}`)**: User `'u1'` attempting to write `/wishlist_settings/u2` -> `PERMISSION_DENIED`.
