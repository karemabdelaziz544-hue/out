# OUT Platform — Role System

## Overview

The OUT platform uses Role-Based Access Control (RBAC).

Roles are stored in the `profiles.role` column in PostgreSQL.
Roles are enforced at three layers:
1. Supabase RLS (database level — cannot be bypassed)
2. Server Component guards (`requireRole()`)
3. UI conditional rendering (`hasPermission()` — convenience only)

**The role is NEVER trusted from the JWT or from the client.**
It is always fetched from the `profiles` table server-side.

---

## Roles

### `admin` — مدير النظام

**Full system access.**

The administrator can:
- Manage all users (create, deactivate, change roles)
- Access all data across all modules
- Configure system settings
- View all reports

### `manager` — مدير

**Operations management access.**

The manager can:
- View all customers, shipments, documents
- Manage the team
- View reports
- Configure general settings
- Cannot manage system-level users

### `data_entry` — مدخل بيانات

**Data input access.**

The data entry operator can:
- Create and update shipment records
- Upload documents
- Manage tasks assigned to them

### `scout` — مندوب

**Field operations access.**

The scout can:
- View and update assigned tasks
- Limited shipment visibility

### `inspector` — مفتش

**Inspection access.**

The inspector can:
- View documents
- Update inspection-related tasks
- Cannot modify customer or shipment data

### `customer` — عميل

**Customer portal access.**

The customer can:
- View their own shipments
- View their own documents
- Cannot see other customers' data (enforced by RLS)

---

## Extending Roles

To add a new role:

1. Add the value to the PostgreSQL enum:
   ```sql
   ALTER TYPE public.user_role ADD VALUE 'new_role';
   ```

2. Add to the TypeScript type in `src/types/auth.ts`:
   ```typescript
   export type UserRole = ... | "new_role";
   ```

3. Add Arabic label in `USER_ROLE_LABELS`:
   ```typescript
   new_role: "الدور الجديد"
   ```

4. Add permissions in `src/config/permissions.ts`:
   ```typescript
   new_role: ["view:dashboard", ...]
   ```

5. Update RLS policies as needed.

---

## Permission Matrix

| Permission | customer | admin | data_entry | scout | inspector | manager |
|-----------|----------|-------|------------|-------|-----------|---------|
| `view:dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view:customers` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `view:shipments` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `view:documents` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `view:tasks` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view:team` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `view:reports` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `view:settings` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `manage:users` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manage:settings` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

> This matrix is the foundation. Business rules will refine it in future phases.
