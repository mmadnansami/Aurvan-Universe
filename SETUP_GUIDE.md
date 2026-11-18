# AURVAN UNIVERSE — Platform Setup & Administration Guide

## 1. Architecture Summary

AURVAN UNIVERSE runs as a full-stack TypeScript web platform:
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, React Router
- **Backend Server**: Express (`server.ts`) with strict server-side authorization, scrypt password hashing, persistent 30-day HTTP-only session cookies + Bearer tokens, and separated public/private file storage (`uploads/public` and `uploads/private`).
- **Database**: SQLite (`data/aurvan.db`) for zero-config local/Cloud Run operation, alongside a complete PostgreSQL + Row-Level Security (RLS) migration in `supabase/migrations/001_initial_schema.sql` for external Supabase hosting.

---

## 2. Initial Super Admin Access

- **Admin Email**: `muttakiadnansami@gmail.com`
- **Authentication Method**: Standard Email + Password sign-in on `/auth` (no third-party Google sign-in).
- **Persistent Browser Session**: Signing in issues a 30-day persistent session cookie and local session token so returning users and administrators remain signed in across browser reloads until they explicitly sign out.
- **Role Security**: Registration strictly creates `PLAYER` accounts. Only a server-side `SUPER_ADMIN` can manage roles or elevate institutional assignments.

---

## 3. Environment Variables

Configure `.env` (see `.env.example`):
- `PORT`: `3000`
- `SESSION_SECRET`: Long random string for HMAC token signing.
- `BOOTSTRAP_ADMIN_EMAIL`: Initial Super Admin email (`muttakiadnansami@gmail.com`).
- `BOOTSTRAP_ADMIN_PASSWORD`: Optional override password for initial bootstrap provisioning.
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Optional credentials when deploying against Supabase PostgreSQL & Storage.

---

## 4. Initial State & Case Publishing Workflow

1. **Zero Published Cases at Launch**: No investigation cases are published during initial deployment. Public archives display `"No Investigation Cases Available Yet."`
2. **Creating & Publishing a Case**:
   - Sign in as Super Admin and open `/admin`.
   - Go to **Cases & Dossiers** -> **Create Draft Case**.
   - Complete Metadata, Story & Chapters, Evidence, Characters, Witnesses & Interrogations, Hints, Tasks/Evaluation Criteria, and the **Private Master Solution**.
   - Click **Publish Case** only after all required validation checks pass.
3. **Confidentiality**: Private master solutions, internal admin notes, private character info, hidden interrogation rules, and confidential documents are stored and enforced server-side and never sent to player-facing endpoints.
