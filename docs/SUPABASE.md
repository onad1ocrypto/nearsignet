# Optional: durable `/to/<handle>` profiles with Supabase

**Not required.** Escrows, verdicts, seals and every money movement live on the NEAR
contract; nothing in the payment path reads this store. Without Supabase, a published
profile lives in the memory of one serverless instance and can disappear on a cold
start — the rest of the app is unaffected.

Two env vars turn it on (Vercel → Project → Settings → Environment Variables, then
redeploy):

| Key | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL, e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Same page → API Keys → `service_role` secret (`sb_secret_…` or the legacy JWT) |

Set them for **Production** (and Preview if you want previews to behave the same).
The route accepts `SUPABASE_SECRET_KEY` as an alias. Never expose this key to the
browser and never commit it.

## 1. Create the table

Supabase dashboard → **SQL Editor** → run:

```sql
create table if not exists public.profiles (
  handle      text primary key,
  account_id  text not null,
  profile     jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_account_id_idx on public.profiles (account_id);

-- The app authenticates with the service_role key, so no RLS policies are needed.
-- Turn RLS on anyway so a leaked anon key can never read the table directly.
alter table public.profiles enable row level security;
```

## 2. Verify

```sh
# should answer {"ok":true,"handle":"…"} once a profile is published from /profile
curl -s -X POST https://nearsignet.vercel.app/api/profile \
  -H 'Content-Type: application/json' \
  -d '{"handle":"probe-test","name":"Probe","nearAccount":"probe.testnet"}'

curl -s https://nearsignet.vercel.app/api/profile          # durable:true expected
curl -s https://nearsignet.vercel.app/api/profiles/probe-test
```

`POST /api/profile` answers `{"ok":false,"error":"table_missing"}` when the SQL above
has not been run yet, and `{"ok":false,"error":"failed","detail":"supabase 401"}` when
the key is wrong — both are explicit instead of silently falling back to memory.

## 3. What it does *not* fix

- It does not make account ownership provable — that is NEP-413 wallet signing.
- It does not touch escrow state, verification or settlement.
- It adds a third-party dependency to one page (`/to/[handle]`, `/profile`).
