-- 拾光校园工具 —— 数据库结构
-- 使用方法：打开 Supabase 项目 -> 左侧菜单 SQL Editor -> New query -> 把这整个文件内容粘贴进去 -> Run
-- 如果报错，把报错信息发给 Claude 就行，不用自己排查

-- ========== 1. 用户资料表 ==========
-- Supabase 自带一个 auth.users 表管理登录账号，这里再建一个 profiles 表存"昵称"和"是不是管理员"
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 新用户注册时，自动在 profiles 里建一条对应记录
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ========== 2. 课程 ==========
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  teacher text,
  color_hue int not null default 175,
  week_pattern text not null default 'all' check (week_pattern in ('all','odd','even','custom')),
  custom_weeks int[],
  created_at timestamptz not null default now()
);

-- ========== 3. 课表格子（某门课占用第几天第几节） ==========
create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  period_start int not null,
  period_count int not null default 1,
  created_at timestamptz not null default now()
);

-- ========== 4. 每节课的时间设置（可自定义） ==========
create table if not exists period_times (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  period_number int not null,
  start_time time not null,
  duration_minutes int not null default 45,
  created_at timestamptz not null default now(),
  unique (owner_id, period_number)
);

-- ========== 5. 作业/考试 DDL ==========
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  course_id uuid references courses(id) on delete set null,
  type text not null check (type in ('assignment','exam')),
  title text not null,
  week_number int not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  time_note text,
  note text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ========== 6. 吃饭地点（个人清单 + 公共清单） ==========
create table if not exists food_places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  is_public boolean not null default false,
  budget_level int,
  lat double precision,
  lng double precision,
  distance_meters int,
  is_open boolean not null default true,
  wait_minutes int,
  created_at timestamptz not null default now()
);

create table if not exists food_draw_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  food_place_id uuid references food_places(id) on delete set null,
  food_name_snapshot text,
  drawn_at timestamptz not null default now()
);

-- ========== 7. 分组名单（全班共享，只有管理员能改） ==========
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists group_draw_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  member_name_snapshot text,
  drawn_at timestamptz not null default now()
);

-- ========== 8. 打开行级安全（RLS）——保证每个人只能改自己的东西 ==========
alter table profiles enable row level security;
alter table courses enable row level security;
alter table schedule_slots enable row level security;
alter table period_times enable row level security;
alter table tasks enable row level security;
alter table food_places enable row level security;
alter table food_draw_history enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_draw_history enable row level security;

-- 下面每个 policy 前面都先 drop if exists，这样这份脚本可以重复运行不会报错

-- profiles：本人可读写自己的资料；所有登录用户都能看到别人的昵称/是否管理员（用来显示、判断权限）
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- courses / schedule_slots / period_times / tasks：只能看/改自己的
drop policy if exists "courses_own" on courses;
create policy "courses_own" on courses for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "schedule_slots_own" on schedule_slots;
create policy "schedule_slots_own" on schedule_slots for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "period_times_own" on period_times;
create policy "period_times_own" on period_times for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "tasks_own" on tasks;
create policy "tasks_own" on tasks for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- food_places：个人清单只有自己可见可改；公共清单所有登录用户可见，登录用户都能新增，只有自己发的能改/删
drop policy if exists "food_places_select" on food_places;
create policy "food_places_select" on food_places for select
  using (is_public = true or auth.uid() = owner_id);
drop policy if exists "food_places_insert" on food_places;
create policy "food_places_insert" on food_places for insert
  with check (auth.uid() = owner_id);
drop policy if exists "food_places_update_own" on food_places;
create policy "food_places_update_own" on food_places for update
  using (auth.uid() = owner_id);
drop policy if exists "food_places_delete_own" on food_places;
create policy "food_places_delete_own" on food_places for delete
  using (auth.uid() = owner_id);

drop policy if exists "food_draw_history_own" on food_draw_history;
create policy "food_draw_history_own" on food_draw_history for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- groups / group_members：全班都能看，只有管理员（profiles.is_admin = true）能增删改
drop policy if exists "groups_select_all" on groups;
create policy "groups_select_all" on groups for select using (auth.role() = 'authenticated');
drop policy if exists "groups_admin_write" on groups;
create policy "groups_admin_write" on groups for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
drop policy if exists "groups_admin_update" on groups;
create policy "groups_admin_update" on groups for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
drop policy if exists "groups_admin_delete" on groups;
create policy "groups_admin_delete" on groups for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "group_members_select_all" on group_members;
create policy "group_members_select_all" on group_members for select using (auth.role() = 'authenticated');
drop policy if exists "group_members_admin_write" on group_members;
create policy "group_members_admin_write" on group_members for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
drop policy if exists "group_members_admin_update" on group_members;
create policy "group_members_admin_update" on group_members for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
drop policy if exists "group_members_admin_delete" on group_members;
create policy "group_members_admin_delete" on group_members for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- group_draw_history：全班可见（看谁被抽到过），任何登录用户都能新增一条抽签记录
drop policy if exists "group_draw_history_select_all" on group_draw_history;
create policy "group_draw_history_select_all" on group_draw_history for select using (auth.role() = 'authenticated');
drop policy if exists "group_draw_history_insert" on group_draw_history;
create policy "group_draw_history_insert" on group_draw_history for insert
  with check (auth.uid() = owner_id);

-- ========== 完成 ==========
-- 运行没有报错的话，左侧 "Table Editor" 里应该能看到这十张表。
-- 之后 Stella 自己注册的第一个账号，需要手动把 profiles 表里她那一行的 is_admin 改成 true，
-- 这样她才有权限管理分组名单（这一步会在后面单独说明怎么操作）。
