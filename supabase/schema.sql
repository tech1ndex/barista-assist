-- Run this once in the Supabase SQL editor.

create table if not exists shots (
  id          uuid primary key,                -- generated on the client, so an
                                               -- offline shot has an identity before
                                               -- it ever reaches Postgres
  user_id     uuid not null default auth.uid()
                references auth.users on delete cascade,
  pulled_at   timestamptz not null,
  dose_g      numeric(5,2) not null check (dose_g > 0),
  yield_g     numeric(5,2) not null check (yield_g > 0),
  time_s      numeric(5,1) not null check (time_s > 0),
  grind       numeric(5,2),
  bean        text,
  taste       text not null
                check (taste in ('sour','balanced','bitter','watery')),
  deleted_at  timestamptz,                     -- tombstone, so a deletion can
                                               -- propagate to offline devices
  updated_at  timestamptz not null default now()
);

create index if not exists shots_user_updated_idx on shots (user_id, updated_at);

-- updated_at is assigned by the server on every write. Never trust the client
-- clock for it: the sync high-water mark is compared against these values, and
-- a device with a fast clock would otherwise skip rows it never pulled.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shots_set_updated_at on shots;
create trigger shots_set_updated_at
  before insert or update on shots
  for each row execute function set_updated_at();

alter table shots enable row level security;

drop policy if exists shots_select_own on shots;
create policy shots_select_own on shots
  for select using (auth.uid() = user_id);

drop policy if exists shots_insert_own on shots;
create policy shots_insert_own on shots
  for insert with check (auth.uid() = user_id);

drop policy if exists shots_update_own on shots;
create policy shots_update_own on shots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Deliberately no delete policy: deletion is a tombstone, which is an update.
