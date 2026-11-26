# OUT Platform — Development Guide

## Prerequisites

- Node.js 22+
- npm 10+
- A Supabase project (free tier works for development)

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd Out

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

---

## Environment Variables

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

You can find these in your Supabase project:
- **Settings** → **API** → Project URL and anon key
- Service role key is also on the same page (keep it secret)

---

## Running Locally

```bash
npm run dev
```

App will be available at: http://localhost:3000

---

## Connecting Supabase

### Option A: Supabase Cloud (Recommended for getting started)

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy the project URL and anon key into `.env.local`
3. Run migrations (see below)
4. Create development users (see below)

### Option B: Supabase Local (Docker required)

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# The CLI will print your local URL and keys — use those in .env.local
```

---

## Running Migrations

### Via Supabase Dashboard (easiest)

1. Go to your Supabase project → **SQL Editor**
2. Open `supabase/migrations/0001_create_profiles.sql`
3. Paste the contents and run

### Via Supabase CLI

```bash
# If using Supabase CLI with a linked project
supabase db push

# If using local Supabase
supabase migration up
```

### Migration Order

Always run migrations in numbered order:

| File | Description |
|------|-------------|
| `0001_create_profiles.sql` | Creates the `profiles` table, RLS policies, triggers |

---

## Creating Development Users

### Step 1 — Create Auth Users

Go to your Supabase project → **Authentication** → **Users** → **Add User**

Create these users (email + password only — the trigger will create the profile row):

| Email | Password | Role |
|-------|----------|------|
| `admin@out.dev` | `DevAdmin123!` | admin |
| `manager@out.dev` | `DevManager123!` | manager |
| `dataentry@out.dev` | `DevData123!` | data_entry |
| `scout@out.dev` | `DevScout123!` | scout |
| `inspector@out.dev` | `DevInspect123!` | inspector |
| `customer@out.dev` | `DevCustomer123!` | customer |

### Step 2 — Run the Seed

After the auth users are created (the trigger will auto-create their profiles), run the seed to set roles and names:

Go to **SQL Editor** and paste `supabase/seed/dev_seed.sql`, then run it.

### Step 3 — Verify

```sql
SELECT id, full_name, email, role, is_active FROM public.profiles;
```

---

## Testing Authentication

1. Start the dev server: `npm run dev`
2. Visit: http://localhost:3000
3. You'll be redirected to `/login`
4. Log in with any development user (e.g. `admin@out.dev` / `DevAdmin123!`)
5. You'll see the dashboard shell with:
   - Your user ID
   - Your email
   - Your role (Arabic label)
   - Navigation placeholders

---

## Code Quality

```bash
# Lint
npm run lint

# TypeScript check
npx tsc --noEmit
```

---

## Project Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Important Architectural Rules

1. **Never import `lib/supabase/server.ts` in Client Components**
2. **Never import `lib/supabase/middleware.ts` outside `middleware.ts`**
3. **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser** (no `NEXT_PUBLIC_` prefix)
4. **Never trust role from JWT claims** — always fetch from `profiles` table
5. **Always validate inputs with Zod** in Server Actions
6. **Never expose database error messages to users** — use `getErrorMessage()`
