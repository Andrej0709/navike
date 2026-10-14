-- Navike: database schema for Supabase.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.

-- ============ Tables ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Igrač' check (char_length(name) between 1 and 30),
  color text not null default '#D4FF3A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '✅' check (char_length(icon) <= 8),
  diff text not null default 'srednje' check (diff in ('lako', 'srednje', 'tesko')),
  streak int not null default 0,
  last_done date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index habits_team_idx on public.habits(team_id);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  photo_path text not null unique,
  caption text not null default '',
  points int not null,
  streak int not null,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);
create index checkins_team_created_idx on public.checkins(team_id, created_at desc);

create table public.reactions (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('fire', 'strong', 'clap')),
  created_at timestamptz not null default now(),
  primary key (checkin_id, user_id, kind)
);

-- ============ Helpers ============

create function public.is_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create function public.shares_team(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- Create a profile automatically for every new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, color) values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Igrač'), 30),
    (array['#D4FF3A', '#3AE0FF', '#FF5A36', '#A35CFF', '#2FD39A', '#FFB020'])[1 + floor(random() * 6)::int]
  ) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Row level security ============

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;
alter table public.reactions enable row level security;

create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team(id));
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "teams read" on public.teams for select to authenticated
  using (public.is_member(id));

create policy "members read" on public.team_members for select to authenticated
  using (public.is_member(team_id));
create policy "members leave" on public.team_members for delete to authenticated
  using (user_id = auth.uid());

create policy "habits read" on public.habits for select to authenticated
  using (public.is_member(team_id));
create policy "habits insert" on public.habits for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(team_id));
create policy "habits update own" on public.habits for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "checkins read" on public.checkins for select to authenticated
  using (public.is_member(team_id));

create policy "reactions read" on public.reactions for select to authenticated
  using (exists (select 1 from public.checkins c where c.id = checkin_id and public.is_member(c.team_id)));
create policy "reactions add" on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.checkins c where c.id = checkin_id and public.is_member(c.team_id)));
create policy "reactions remove" on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- Column-level limits: streak, points and membership only change through the functions below.
revoke insert, update, delete on public.teams from anon, authenticated;
revoke insert, update on public.team_members from anon, authenticated;
revoke insert, update on public.habits from anon, authenticated;
grant insert (team_id, name, icon, diff) on public.habits to authenticated;
grant update (name, icon, diff, archived) on public.habits to authenticated;
revoke insert, update, delete on public.checkins from anon, authenticated;
revoke update on public.reactions from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name, color, onboarded) on public.profiles to authenticated;

-- ============ Functions called from the app ============

create function public.create_team(p_name text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t teams;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Nisi prijavljen'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Upiši ime ekipe'; end if;
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from teams where code = v_code);
  end loop;
  insert into teams (name, code, created_by) values (left(trim(p_name), 40), v_code, auth.uid()) returning * into t;
  insert into team_members (team_id, user_id) values (t.id, auth.uid());
  return t;
end $$;

create function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t teams;
begin
  if auth.uid() is null then raise exception 'Nisi prijavljen'; end if;
  select * into t from teams where code = upper(trim(p_code));
  if not found then raise exception 'Ne postoji ekipa sa tim kodom'; end if;
  insert into team_members (team_id, user_id) values (t.id, auth.uid()) on conflict do nothing;
  return t;
end $$;

-- Points: base by difficulty (5/10/20) x streak multiplier (+10% per day in a row, max 2x).
create function public.complete_habit(p_habit uuid, p_photo text, p_caption text, p_day date) returns public.checkins
language plpgsql security definer set search_path = public as $$
declare
  h habits;
  c checkins;
  v_streak int;
  v_points int;
  v_utc date := (now() at time zone 'utc')::date;
begin
  select * into h from habits where id = p_habit and user_id = auth.uid() and not archived for update;
  if not found then raise exception 'Navika ne postoji'; end if;
  if not is_member(h.team_id) then raise exception 'Nisi u ovoj ekipi'; end if;
  if p_day not between v_utc - 1 and v_utc + 1 then raise exception 'Pogrešan datum'; end if;
  if h.last_done = p_day then raise exception 'Ovu naviku si već uradio danas'; end if;
  if p_photo is null or split_part(p_photo, '/', 1) <> h.team_id::text or split_part(p_photo, '/', 2) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'proofs' and name = p_photo) then
    raise exception 'Fali slika kao dokaz';
  end if;

  v_streak := case when h.last_done = p_day - 1 then h.streak + 1 else 1 end;
  v_points := round(
    (case h.diff when 'lako' then 5 when 'srednje' then 10 else 20 end)
    * least(2.0, 1 + (v_streak - 1) * 0.1)
  );

  update habits set streak = v_streak, last_done = p_day where id = h.id;
  insert into checkins (user_id, habit_id, team_id, photo_path, caption, points, streak, day)
    values (auth.uid(), h.id, h.team_id, p_photo, left(trim(coalesce(p_caption, '')), 80), v_points, v_streak, p_day)
    returning * into c;
  return c;
end $$;

revoke execute on function public.create_team(text) from public, anon;
revoke execute on function public.join_team(text) from public, anon;
revoke execute on function public.complete_habit(uuid, text, text, date) from public, anon;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.complete_habit(uuid, text, text, date) to authenticated;

-- ============ Photo storage ============
-- Path format: <team_id>/<user_id>/<random>.jpg  (only team members can see them)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "proofs upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
create policy "proofs read team" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "proofs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[2] = auth.uid()::text);
