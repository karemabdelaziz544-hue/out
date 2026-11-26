# OUT Platform — Architecture

## Overview

OUT is an Egyptian customs clearance and logistics operations management platform built with Next.js 16 (App Router), TypeScript, React 19, and Supabase.

---

## Project Structure

```
/Users/karemabdelaziz/Out/
├── supabase/
│   ├── migrations/          # PostgreSQL migrations (run in order)
│   └── seed/                # Development seed data
│
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (auth)/          # Route group — unauthenticated routes
│   │   │   └── login/       # Login page + form
│   │   ├── (dashboard)/     # Route group — authenticated routes
│   │   │   ├── dashboard/   # Main dashboard (dev shell)
│   │   │   ├── customers/   # Placeholder
│   │   │   ├── shipments/   # Placeholder
│   │   │   ├── documents/   # Placeholder
│   │   │   ├── tasks/       # Placeholder
│   │   │   ├── team/        # Placeholder
│   │   │   ├── notifications/ # Placeholder
│   │   │   ├── reports/     # Placeholder
│   │   │   └── settings/    # Placeholder
│   │   ├── unauthorized/    # 403 page
│   │   ├── error.tsx        # Global error boundary
│   │   ├── not-found.tsx    # 404 page
│   │   ├── layout.tsx       # Root layout (RTL, Arabic, global CSS)
│   │   └── page.tsx         # Root redirect
│   │
│   ├── components/
│   │   ├── ui/              # Reusable UI primitives
│   │   ├── layout/          # Layout components (sidebar, header, etc.)
│   │   └── shared/          # Business-specific shared components
│   │
│   ├── config/
│   │   ├── app.ts           # Brand, routes, app constants
│   │   └── permissions.ts   # Role → Permission matrix
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts    # Browser Supabase client
│   │   │   ├── server.ts    # Server Supabase client
│   │   │   └── middleware.ts # Middleware Supabase client
│   │   ├── auth/
│   │   │   ├── session.ts   # getAuthUser, getProfile, getUserRole
│   │   │   ├── guards.ts    # requireAuth, requireRole, redirectIfAuthenticated
│   │   │   └── actions.ts   # Server Actions: loginAction, logoutAction
│   │   └── utils/
│   │       └── index.ts     # cn(), getRoleLabel(), formatDateAr(), getErrorMessage()
│   │
│   ├── proxy.ts             # Next.js proxy — session refresh + route protection
│   │
│   ├── styles/
│   │   └── globals.css      # Design tokens + base styles + RTL
│   │
│   └── types/
│       ├── auth.ts          # UserRole, Profile, AuthUser, Permission
│       ├── database.ts      # Database type (Supabase typed client)
│       └── index.ts         # Barrel export
│
├── .env.example             # Environment variables template
└── docs/                    # Documentation
```

---

## Frontend Architecture

### Next.js App Router

- **Server Components** (default): Data fetching, auth checks, layout
- **Client Components** (`"use client"`): Interactive forms, state, browser APIs
- **Server Actions** (`"use server"`): Form submissions, mutations

### Route Groups

| Group | Purpose |
|-------|---------|
| `(auth)` | Pages accessible only when NOT authenticated |
| `(dashboard)` | Pages accessible only when authenticated |

Route groups do not appear in the URL. The layouts enforce authentication:
- `(auth)/layout.tsx` → calls `redirectIfAuthenticated()`
- `(dashboard)/layout.tsx` → calls `requireAuth()`

---

## Supabase Architecture

### Clients

| File | Use in |
|------|--------|
| `lib/supabase/client.ts` | Client Components (browser) |
| `lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers |
| `lib/supabase/middleware.ts` | proxy.ts only |

**Never use the server client in browser context.**
**Never use the browser client in server context.**

### Typed Client

The Supabase client is typed with the `Database` interface from `src/types/database.ts`. This gives full TypeScript auto-complete and type safety on all queries.

---

## Authentication

### Flow

```
User visits protected route
        ↓
proxy.ts runs
        ↓
supabase.auth.getUser() validates JWT with Supabase
        ↓
If no session → redirect to /login
        ↓
User submits login form
        ↓
loginAction() (Server Action) validates with Zod
        ↓
supabase.auth.signInWithPassword()
        ↓
Session stored in cookies (managed by @supabase/ssr)
        ↓
Redirect to /dashboard
```

### Session Management

Session is stored in HTTP-only cookies managed by `@supabase/ssr`. The proxy refreshes the session on every request.

### Security

- `getUser()` is used (not `getSession()`) — validates JWT server-side with Supabase
- Roles are fetched from the `profiles` table — never from JWT claims
- The service role key is never exposed to the browser

---

## Authorization

### Role System

```typescript
type UserRole = "customer" | "admin" | "data_entry" | "scout" | "inspector" | "manager";
```

### Permission Checks

```typescript
// Server-side guard (use in Server Components)
await requireAuth();          // must be authenticated
await requireRole(["admin"]); // must have specific role

// Client-side UI only (not for real access control)
hasPermission(role, "view:reports");
```

### Layers of Defense

1. **Proxy** — fast edge check, redirects unauthenticated requests
2. **Route layout guards** — Server Component `requireAuth()` / `requireRole()`
3. **Supabase RLS** — database-level enforcement, cannot be bypassed

---

## Database Foundation

### Tables

| Table | Description |
|-------|-------------|
| `profiles` | User metadata — one row per auth user |

### Row Level Security

All tables have RLS enabled. The `profiles` table policies:

| Policy | Rule |
|--------|------|
| `profiles_select_own` | Users can read their own profile |
| `profiles_select_admin` | Admins and managers can read all profiles |
| `profiles_update_own` | Users can update their own profile (cannot change role/is_active) |
| `profiles_update_admin` | Admins can update any profile |

---

## Environment Variables

See [`.env.example`](../.env.example) for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server scripts only | Service role key — never expose to browser |
| `NEXT_PUBLIC_APP_URL` | Optional | App URL for redirects |

---

## Design System

### Brand

| Token | Value |
|-------|-------|
| Primary (Black) | `#0A0A0A` |
| Accent (Yellow) | `#F5C500` |
| Background (White) | `#FAFAFA` |

All values are CSS custom properties in `src/styles/globals.css`.

### Typography

Font: **IBM Plex Sans Arabic** — loaded from Google Fonts.

### RTL

The application is Arabic-first RTL:
- `html[dir="rtl" lang="ar"]` set in root layout
- Logical CSS properties used throughout
- IBM Plex Sans Arabic supports Arabic rendering
