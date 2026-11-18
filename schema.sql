-- =====================================================================
-- ABSEN PIKET PMR SMK N 2 PATI  -  skema database Supabase
-- Cara pakai: Supabase > SQL Editor > New query > tempel semua > Run.
-- Aman dijalankan ulang (memakai "if not exists" / "or replace").
-- =====================================================================

-- ---------- 1. TABEL ------------------------------------------------

-- Satu baris per akun (anggota atau admin). Diisi oleh script import.
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  username  text unique not null,
  full_name text not null,
  nickname  text,                                   -- nama panggilan di jadwal; diisi import
  role      text not null default 'member' check (role in ('member','admin'))
);

-- Jadwal resmi. day: 1=Senin ... 5=Jumat
create table if not exists public.schedule (
  id       serial primary key,
  nickname text not null,
  day      int  not null check (day between 1 and 5),
  session  text not null check (session in ('Pagi','Sore')),
  unique (nickname, day)
);

-- Data absensi. Hanya bisa dibuat lewat fungsi submit_attendance() di bawah.
create table if not exists public.attendance (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  username   text not null,
  full_name  text not null,
  att_date   date not null,
  day_name   text not null,
  session    text not null,
  att_time   timestamptz not null default now(),
  photo_path text not null,
  status     text not null default 'Sudah Absen',
  unique (user_id, att_date)                         -- mencegah absen ganda
);

-- ---------- 2. JADWAL PIKET RESMI -----------------------------------
-- Dari prompt Anda, tanpa perubahan. Nama = nama panggilan.
insert into public.schedule (nickname, day, session) values
  ('Depi',1,'Pagi'),('Faiz',1,'Pagi'),('Kiana',1,'Pagi'),
  ('Tegar',1,'Sore'),('Sipa',1,'Sore'),
  ('Rahman',2,'Pagi'),('Erlita',2,'Pagi'),
  ('Jia',2,'Sore'),('Yapi',2,'Sore'),
  ('Moza',3,'Pagi'),('Hilma',3,'Pagi'),
  ('Bagaz',3,'Sore'),('Najwa',3,'Sore'),('Juan',3,'Sore'),
  ('Annisa',4,'Pagi'),('Amira',4,'Pagi'),
  ('Nisa',4,'Sore'),('Puja',4,'Sore'),('Salwa',4,'Sore'),
  ('Riska',5,'Pagi'),('Aji',5,'Pagi'),
  ('Safira',5,'Sore'),('Toha',5,'Sore')
on conflict (nickname, day) do nothing;

-- ---------- 3. FUNGSI BANTU -----------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Boleh absen hari ini? (punya jadwal DAN belum absen). Waktu = server, WIB.
create or replace function public.can_absen_today() returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.profiles p
      join public.schedule s on s.nickname = p.nickname
      where p.id = auth.uid() and p.role = 'member'
        and s.day = extract(isodow from (now() at time zone 'Asia/Jakarta'))::int
    )
    and not exists (
      select 1 from public.attendance a
      where a.user_id = auth.uid()
        and a.att_date = (now() at time zone 'Asia/Jakarta')::date
    );
$$;

-- Info piket hari ini untuk anggota yang login (dipakai Beranda & Absen).
create or replace function public.my_today() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  d   date := (now() at time zone 'Asia/Jakarta')::date;
  dow int  := extract(isodow from d)::int;
  p   public.profiles%rowtype;
  s   public.schedule%rowtype;
  a   public.attendance%rowtype;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Profil tidak ditemukan'; end if;
  select * into s from public.schedule where nickname = p.nickname and day = dow;
  select * into a from public.attendance where user_id = p.id and att_date = d;
  return json_build_object(
    'date', d, 'dow', dow,
    'has_schedule', s.id is not null, 'session', s.session,
    'attended', a.id is not null, 'att_time', a.att_time,
    'photo_path', a.photo_path, 'status', a.status
  );
end $$;

-- Simpan absensi. SEMUA validasi dilakukan di sini (di server), bukan di tombol.
create or replace function public.submit_attendance(p_photo_path text) returns json
language plpgsql security definer set search_path = public as $$
declare
  d   date := (now() at time zone 'Asia/Jakarta')::date;
  dow int  := extract(isodow from d)::int;
  hari text[] := array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
  p public.profiles%rowtype;
  s public.schedule%rowtype;
  a public.attendance%rowtype;
begin
  select * into p from public.profiles where id = auth.uid() and role = 'member';
  if not found then raise exception 'Akun tidak valid.'; end if;

  select * into s from public.schedule where nickname = p.nickname and day = dow;
  if not found then raise exception 'Anda tidak memiliki jadwal piket hari ini.'; end if;

  if exists (select 1 from public.attendance where user_id = p.id and att_date = d) then
    raise exception 'Anda sudah melakukan absen piket hari ini.';
  end if;

  -- foto wajib: harus ada di folder milik sendiri dan benar-benar terunggah
  if p_photo_path is null
     or split_part(p_photo_path, '/', 1) <> p.id::text
     or not exists (select 1 from storage.objects where bucket_id = 'bukti' and name = p_photo_path) then
    raise exception 'Foto bukti diperlukan untuk melakukan absen.';
  end if;

  insert into public.attendance (user_id, username, full_name, att_date, day_name, session, photo_path)
  values (p.id, p.username, p.full_name, d, hari[dow], s.session, p_photo_path)
  returning * into a;

  return json_build_object('att_time', a.att_time, 'session', a.session, 'status', a.status);
end $$;

-- Data piket untuk admin pada satu tanggal: semua yang dijadwalkan + status absennya.
create or replace function public.admin_piket(p_date date)
returns table (panggilan text, nama text, username text, hari int, sesi text,
               status text, jam timestamptz, foto text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Akses ditolak.'; end if;
  return query
    select s.nickname, p.full_name, p.username, s.day, s.session,
           case when a.id is not null then 'Sudah Absen' else 'Belum Absen' end,
           a.att_time, a.photo_path
    from public.schedule s
    left join public.profiles   p on p.nickname = s.nickname and p.role = 'member'
    left join public.attendance a on a.user_id = p.id and a.att_date = p_date
    where s.day = extract(isodow from p_date)::int
    order by s.session asc, s.nickname asc;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.can_absen_today(), public.my_today(),
  public.submit_attendance(text), public.admin_piket(date) to authenticated;

-- ---------- 4. KEAMANAN BARIS (RLS) ---------------------------------

alter table public.profiles   enable row level security;
alter table public.schedule   enable row level security;
alter table public.attendance enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists schedule_read   on public.schedule;
drop policy if exists attendance_read on public.attendance;

-- Anggota: hanya miliknya sendiri. Admin: semua. Tidak ada policy insert/update/delete
-- untuk pengguna, jadi data tidak bisa diubah langsung dari browser.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy schedule_read on public.schedule for select to authenticated
  using (public.is_admin()
         or nickname = (select nickname from public.profiles where id = auth.uid()));

create policy attendance_read on public.attendance for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Password tersimpan sebagai hash oleh Supabase Auth; tidak ada tabel password di sini.

-- ---------- 5. PENYIMPANAN FOTO (PRIVATE) ---------------------------

insert into storage.buckets (id, name, public) values ('bukti', 'bukti', false)
on conflict (id) do nothing;

drop policy if exists bukti_upload on storage.objects;
drop policy if exists bukti_read   on storage.objects;

-- Unggah: hanya ke folder sendiri, dan hanya jika hari ini punya jadwal & belum absen.
create policy bukti_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.can_absen_today());

-- Lihat: pemilik foto dan admin saja.
create policy bukti_read on storage.objects for select to authenticated
  using (bucket_id = 'bukti'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
