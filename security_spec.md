# AURVAN UNIVERSE Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Unpublished Isolation**: Draft, In-Review, Ready-to-Publish, and Archived cases (`status != 'PUBLISHED'`) and their child chapters, evidence, characters, witnesses, interrogations, and hints MUST NEVER be readable by guests or players.
2. **Confidentiality & Anti-Spoiler Isolation**: `/caseSolutions/{caseId}` and confidential `/documents/{docId}` (`is_confidential == true`) MUST strictly deny non-admin reads (`isAdmin()` only).
3. **PII Isolation**: User email addresses reside exclusively inside `/users/{uid}/private/info` (`isOwner(uid) || isAdmin()`), never in public `/users/{uid}` profiles.
4. **No Self-Privilege Escalation**: Non-admin users cannot create `/admins/{uid}`, cannot set `role != 'PLAYER'` on `/users/{uid}` (except verified bootstrap admin `muttakiadnansami@gmail.com`), and cannot modify `role`, `status`, `institution_id`, `rank_id`, `approved_cases_count`, or `average_score` on update.
5. **Verified Identity & Strict Server Timestamps**: All authenticated writes require `request.auth.token.email_verified == true` and enforce `createdAt == request.time` / `updatedAt == request.time`.
6. **Path & Size Hardening**: Every single-document operation validates `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, `<= 128`), and every string/list enforces explicit `.size()` caps.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Admin Email Spoof**: `{ email: "muttakiadnansami@gmail.com", email_verified: false }` attempting write to `/admins/{uid}` -> **DENIED**.
2. **Player Self-Promotion on Create**: `{ id: "u1", role: "SUPER_ADMIN", status: "ACTIVE", ... }` written by non-admin -> **DENIED**.
3. **Player Self-Rank Upgrade on Update**: `{ rank_id: 9, approved_cases_count: 25, updatedAt: request.time }` via `/users/{uid}` update -> **DENIED** (`affectedKeys().hasOnly(['full_name', 'bio', 'updatedAt'])`).
4. **Shadow Ghost Field Injection**: `{ full_name: "Test", bio: "", updatedAt: request.time, isAdmin: true }` -> **DENIED**.
5. **Client Timestamp Forgery**: Creating a report with `{ createdAt: "2020-01-01T00:00:00Z" }` instead of `request.time` -> **DENIED**.
6. **Orphaned Case Report**: Submitting a report for nonexistent `case_id: "fake_case_999"` -> **DENIED** (`exists(/databases/$(database)/documents/cases/$(incoming().case_id))`).
7. **Report Pre-Approval Bypass**: Player creating `/reports/{id}` with `{ status: "APPROVED", score: 100 }` -> **DENIED** (`incoming().status == 'SUBMITTED'`).
8. **Cross-User Note Tampering**: User A writing `/users/{userB}/caseNotes/{caseId}` -> **DENIED**.
9. **Draft Case Exfiltration**: Player calling `get` or `list` on `/cases/{draftId}` (`status == "DRAFT"`) -> **DENIED**.
10. **Solution Spoiler Read**: Player calling `get` on `/caseSolutions/{caseId}` -> **DENIED**.
11. **Confidential Document Leak**: Player querying `/documents/{docId}` where `is_confidential == true` -> **DENIED**.
12. **Resource Poisoning / Oversized ID**: Writing `/reports/aaaa... (200 chars)` or `full_name` exceeding 120 chars -> **DENIED**.
