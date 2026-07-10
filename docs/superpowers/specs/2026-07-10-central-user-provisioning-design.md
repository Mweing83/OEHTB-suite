# Central User Provisioning ("Suite Directory") — Design

Date: 2026-07-10
Status: Approved (Approach A), executing across portal + handkassen + stunden.

## Problem

The portal (`suite-db`) is already the identity source of truth (`SuiteUser`, `Tool`,
`Zugriff`), but each tool keeps a **local mirror** user row (`handkassen.Benutzer`,
`stunden.User`) that is created **lazily on first login** and only re-synced on the next
request. This causes four inconsistencies:

1. **Lazy creation** — a centrally-created user does not exist in a tool until first login
   there, so admins cannot pre-assign tool options (e.g. handkassen kostenstellen).
2. **No delete/deactivate propagation** — removing a user centrally leaves a stale mirror row.
3. **Field drift** — name/email/role only re-sync at next login; stunden even fabricates a
   `benutzername@suite.local` email.
4. **Different identity keys** — handkassen keys on `benutzername`, stunden on email.

## Required guarantees (all four, per stakeholder)

- **Pre-login provisioning** — a user is visible & manageable in a tool before first login.
- **Instant deactivate/delete** — central deactivation/deletion blocks + cleans up everywhere.
- **No field drift** — name/email/role identical across tools automatically.
- **One identity + login** — single SSO, keyed consistently on `suiteUserId`.

## Approach A: portal-push provisioning + thin synced mirrors

The portal becomes the **sole writer** of tool user rows. Tools keep a local row purely as an
FK anchor for their own data (handkassen `Int` ids on buchungen/kostenstellen/audit; stunden
`String` ids), but never own identity fields. Every lifecycle change is pushed to each tool the
user has access to; tools also self-heal from a portal snapshot on startup.

Chosen over B (mirror-free) because handkassen has an `Int` FK graph over **live production
data** — rewriting it to string ids is a heavy, risky migration against the project's
"maximal schlank" principle. Chosen over C (Keycloak/OIDC) because that adds a whole service and
still leaves the tool-side provisioning problem unsolved.

## Canonical identity

- Key everywhere: **`suiteUserId`** (= `SuiteUser.id`, cuid). Already the mirror key in both tools.
- Provisioned user shape: `{ suiteUserId, benutzername, name, email|null, aktiv, rolle|null }`
  where `rolle` is *this tool's* role (from `Zugriff.rolle`), or `null` = no access.
- stunden `email` becomes nullable; the synthetic `@suite.local` email is removed.

## Provisioning contract (identical for every tool, incl. future)

Each tool exposes an **internal** API (Docker network only, NOT routed through nginx),
authenticated by a shared `PROVISION_SECRET` request header (`X-Provision-Secret`):

- `PUT /api/provision/user` — idempotent upsert of one user by `suiteUserId`. `aktiv:false` or
  `rolle:null` ⇒ locally deactivate (block) but retain the row.
- `DELETE /api/provision/user/:suiteUserId` — **tombstone**: deactivate + mark deleted; never a
  hard row delete (buchungen/audit reference the user). Audit-safe reading of "clean up".

Portal counterpart:

- `GET /api/suite/provision/snapshot?tool=<slug>` — full desired user list for a tool (the users
  with a `Zugriff` for that tool, each with resolved role + identity fields). Secret-authenticated.
  Used by tools to reconcile on startup.

Adding a future tool = implement this one router (shared reference impl) + register a
`provisionUrl` on its `Tool` row. No portal code change per tool.

## Reliable delivery (portal → tools)

- New portal table **`ProvisionOutbox`**: `{ id, toolSlug, suiteUserId, op(UPSERT|DELETE),
  payload Json, status(PENDING|DONE|FEHLER), versuche, letzterFehler, erstelltAm, erledigtAm }`.
- Portal mutations enqueue outbox rows (see triggers below) in the same transaction as the data change.
- A **portal worker** (interval loop, started in `index.ts`) drains `PENDING` rows: POST to the
  tool's `provisionUrl`; mark `DONE` on 2xx; on failure increment `versuche`, store `letzterFehler`,
  retry with backoff; give up after N tries (stays `FEHLER`, visible for diagnostics).
- **Self-heal:** each tool calls the portal snapshot on startup and reconciles (upsert all in list,
  deactivate any local mirror with a `suiteUserId` not in the list). Covers downtime, DB reset,
  and newly added tools.

### Provisioning triggers (portal `admin.ts`)

- Grant `Zugriff` for tool X ⇒ enqueue `UPSERT` to X.
- Change role for tool X ⇒ enqueue `UPSERT` to X.
- Revoke `Zugriff` for tool X ⇒ enqueue `UPSERT` with `rolle:null` to X (deactivate locally).
- Edit user stammdaten (name/email/aktiv) ⇒ enqueue `UPSERT` to **every** tool the user currently
  has access to.
- Delete user ⇒ enqueue `DELETE` to every tool the user had access to (tombstone), then delete
  the `SuiteUser` centrally (existing `Zugriff` rows cascade).

Provisioning targets are scoped to tools the user has (or is losing) access to — not every user to
every tool.

## Tool-side changes (handkassen & stunden, identical shape)

- Add `src/routes/provision.ts` (secret-checked `PUT`/`DELETE`) mounted at `/api/provision`.
- Add `src/lib/provisionReconcile.ts`: on startup, fetch snapshot from `SUITE_URL`, upsert/
  deactivate mirrors. Fail-soft (log + continue) if the portal is briefly unreachable; the next
  live push / next startup reconciles.
- Rework `lokalenBenutzerSichern`: the mirror is now guaranteed present via provisioning; keep a
  minimal create-fallback only for resilience (portal never reached yet). Stop writing identity
  fields that provisioning owns beyond the initial safety create.
- stunden: `email` nullable; drop synthetic email.
- Mirrors gain a `geloescht Boolean @default(false)` (tombstone flag); deactivated/tombstoned
  users are blocked by auth middleware regardless of token.

## What stays tool-local

Only tool-specific options — e.g. handkassen `benutzer_kostenstelle` assignments — remain in the
tool, now assignable pre-login. Per-tool **role** remains centrally assigned in the portal and
pushed down (unchanged admin UX).

## Portal Verwaltung UI

Behaviour unchanged for create/edit/role. **Delete** warns when the user has tool access and
performs a tombstone push (rather than implying hard deletion everywhere). Optional (not in first
cut): a per-tool "pending sync / last error" indicator sourced from `ProvisionOutbox`.

## Config / rollout

1. Portal migration: add `ProvisionOutbox` + `Tool.provisionUrl` (nullable).
2. Tool migrations: `geloescht` flag on mirror; stunden `email` nullable.
3. `.env` + compose: add `PROVISION_SECRET` (shared, like `JWT_SECRET`) to portal + both tools;
   seed sets each tool's `provisionUrl` (`http://handkassen-app:3001`, `http://stunden-app:3002`).
4. Backfill: portal enqueues a full snapshot for all users on first boot after upgrade (or rely on
   each tool's startup reconcile). Existing mirror rows already carry `suiteUserId`, so they link
   up with no data loss.

## Security

- Provision endpoints are internal (Docker network) and require `X-Provision-Secret`; not exposed
  via nginx (no new public surface).
- `PROVISION_SECRET` guarded like `JWT_SECRET` (min length in production).

## Testing

- Portal: outbox enqueue on each trigger; worker delivery + retry/backoff; snapshot correctness
  (only users with access, resolved role).
- Tools: provision `PUT`/`DELETE` idempotency + secret rejection; startup reconcile deactivates
  users no longer in snapshot; auth middleware blocks tombstoned/deactivated mirrors.
- End-to-end: create user + grant handkassen role ⇒ appears in handkassen before login; revoke ⇒
  blocked; delete ⇒ tombstoned but buchungen history intact.
