-- Run once in Supabase SQL Editor on a new project.
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  department text,
  location text,
  capacity integer not null check (capacity between 1 and 100),
  equipment text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  department text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  user_id uuid not null references auth.users(id),
  purpose text not null check (char_length(purpose) between 2 and 120),
  attendees integer not null check (attendees > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  booked_by_name text not null,
  department text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at <= interval '4 hours')
);

alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (room_id with =, tstzrange(start_at,end_at,'[)') with &&)
  where (status = 'confirmed');
create index if not exists bookings_room_start_idx on public.bookings(room_id,start_at) where status='confirmed';

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(user_id,full_name,department)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1)),new.raw_user_meta_data->>'department')
  on conflict(user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin');
$$;

create or replace function public.create_booking(p_room_slug text,p_purpose text,p_attendees integer,p_start_at timestamptz,p_end_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_profile public.profiles; v_id uuid; v_start time; v_end time;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_room from public.rooms where slug=p_room_slug and active=true;
  if not found then raise exception 'Room is unavailable.'; end if;
  if p_start_at <= now() then raise exception 'Past time slots cannot be booked.'; end if;
  if p_end_at <= p_start_at or p_end_at-p_start_at > interval '4 hours' then raise exception 'Choose a valid duration of up to 4 hours.'; end if;
  if p_attendees < 1 or p_attendees > v_room.capacity then raise exception 'Attendees exceed room capacity.'; end if;
  v_start=(p_start_at at time zone 'Asia/Kuala_Lumpur')::time; v_end=(p_end_at at time zone 'Asia/Kuala_Lumpur')::time;
  if v_start < time '08:00' or v_end > time '19:00' then raise exception 'Bookings are allowed from 8:00 AM to 7:00 PM.'; end if;
  if extract(minute from v_start)::int % 30 <> 0 or extract(minute from v_end)::int % 30 <> 0 then raise exception 'Bookings must use 30-minute intervals.'; end if;
  select * into v_profile from public.profiles where user_id=auth.uid();
  insert into public.bookings(room_id,user_id,purpose,attendees,start_at,end_at,booked_by_name,department)
  values(v_room.id,auth.uid(),trim(p_purpose),p_attendees,p_start_at,p_end_at,coalesce(v_profile.full_name,'Halo Telco staff'),v_profile.department)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then raise exception 'This time is already booked.';
end $$;

create or replace function public.cancel_booking(p_booking_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),updated_at=now()
  where id=p_booking_id and status='confirmed' and (user_id=auth.uid() or public.is_admin());
  if not found then raise exception 'You cannot cancel this booking.'; end if;
end $$;

alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated using(active=true);
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using(true);

revoke all on public.bookings from anon,authenticated;
grant select on public.bookings to authenticated;
grant select on public.rooms to authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant execute on function public.create_booking(text,text,integer,timestamptz,timestamptz) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

insert into public.rooms(slug,name,department,location,capacity,equipment)
values('marketing-meeting-room','Marketing Meeting Room','Marketing Department','Level —',12,array['Display','Video conference'])
on conflict(slug) do update set name=excluded.name,department=excluded.department,location=excluded.location,capacity=excluded.capacity,equipment=excluded.equipment;

do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null;
end $$;
