-- Casa Porto - schema completo para Supabase
-- Cole este arquivo no SQL Editor do Supabase e clique em Run.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique default lower(encode(gen_random_bytes(6), 'hex')),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','cleaner','viewer')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  address text,
  check_in_time time not null default '14:00',
  check_out_time time not null default '11:00',
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  guest_name text not null,
  phone text,
  check_in date not null,
  check_out date not null,
  guests integer not null default 1 check (guests > 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  source text not null default 'WhatsApp',
  status text not null default 'confirmed' check (status in ('tentative','confirmed','in_house','completed','canceled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_dates_valid check (check_out > check_in)
);

-- Impede sobreposição de reservas ativas da mesma propriedade.
-- O intervalo usa [entrada, saída), então uma reserva pode começar no mesmo dia em que outra termina.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'no_overlapping_active_reservations') then
    alter table public.reservations
      add constraint no_overlapping_active_reservations
      exclude using gist (
        property_id with =,
        daterange(check_in, check_out, '[)') with &&
      ) where (status in ('tentative','confirmed','in_house'));
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text not null default 'Pix',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  spent_at date not null default current_date,
  category text not null default 'Outro',
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  title text not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open','done')),
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reservations_touch_updated_at on public.reservations;
create trigger reservations_touch_updated_at before update on public.reservations
for each row execute function public.touch_updated_at();

-- Garante consistência entre os IDs de household presentes nas tabelas relacionadas.
create or replace function public.validate_reservation_scope()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.properties p
    where p.id = new.property_id and p.household_id = new.household_id
  ) then raise exception 'property does not belong to household'; end if;
  return new;
end;
$$;

create or replace function public.validate_payment_scope()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.reservations r
    where r.id = new.reservation_id and r.household_id = new.household_id
  ) then raise exception 'reservation does not belong to household'; end if;
  return new;
end;
$$;

create or replace function public.validate_task_scope()
returns trigger language plpgsql as $$
begin
  if new.reservation_id is not null and not exists (
    select 1 from public.reservations r
    where r.id = new.reservation_id and r.household_id = new.household_id
  ) then raise exception 'reservation does not belong to household'; end if;
  return new;
end;
$$;

drop trigger if exists validate_reservation_scope_trigger on public.reservations;
create trigger validate_reservation_scope_trigger
before insert or update on public.reservations
for each row execute function public.validate_reservation_scope();

drop trigger if exists validate_payment_scope_trigger on public.payments;
create trigger validate_payment_scope_trigger
before insert or update on public.payments
for each row execute function public.validate_payment_scope();

drop trigger if exists validate_task_scope_trigger on public.tasks;
create trigger validate_task_scope_trigger
before insert or update on public.tasks
for each row execute function public.validate_task_scope();

-- Funções auxiliares de autorização. SECURITY DEFINER evita recursão nas políticas RLS.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_household(p_household_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.role in ('owner','admin')
  );
$$;

create or replace function public.create_household(p_name text, p_property_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_display text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.household_members where user_id = v_user) then
    raise exception 'user already belongs to a household';
  end if;

  v_display := coalesce(auth.jwt()->'user_metadata'->>'name', split_part(auth.jwt()->>'email','@',1));

  insert into public.households(name, owner_user_id)
  values (trim(p_name), v_user)
  returning id into v_household;

  insert into public.household_members(household_id, user_id, role, display_name)
  values (v_household, v_user, 'owner', v_display);

  insert into public.properties(household_id, name)
  values (v_household, trim(p_property_name));

  return v_household;
end;
$$;

create or replace function public.join_household(p_join_code text, p_display_name text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.household_members where user_id = v_user) then
    raise exception 'user already belongs to a household';
  end if;

  select id into v_household
  from public.households
  where join_code = lower(trim(p_join_code));

  if v_household is null then raise exception 'invalid join code'; end if;

  insert into public.household_members(household_id, user_id, role, display_name)
  values (v_household, v_user, 'admin', coalesce(nullif(trim(p_display_name),''), split_part(auth.jwt()->>'email','@',1)));

  return v_household;
end;
$$;

create or replace function public.rotate_join_code(p_household_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.households h
    where h.id = p_household_id and h.owner_user_id = auth.uid()
  ) then raise exception 'only owner can rotate code'; end if;

  v_code := lower(encode(gen_random_bytes(6), 'hex'));
  update public.households set join_code = v_code where id = p_household_id;
  return v_code;
end;
$$;

revoke all on function public.create_household(text,text) from public;
revoke all on function public.join_household(text,text) from public;
revoke all on function public.rotate_join_code(uuid) from public;
grant execute on function public.create_household(text,text) to authenticated;
grant execute on function public.join_household(text,text) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.properties enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.tasks enable row level security;

-- Households
create policy "members read household" on public.households for select to authenticated
using (public.is_household_member(id));
create policy "owner updates household" on public.households for update to authenticated
using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Memberships
create policy "members read memberships" on public.household_members for select to authenticated
using (public.is_household_member(household_id));
create policy "owner manages memberships" on public.household_members for update to authenticated
using (exists(select 1 from public.households h where h.id=household_id and h.owner_user_id=auth.uid()))
with check (exists(select 1 from public.households h where h.id=household_id and h.owner_user_id=auth.uid()));
create policy "owner removes memberships" on public.household_members for delete to authenticated
using (exists(select 1 from public.households h where h.id=household_id and h.owner_user_id=auth.uid()) and user_id <> auth.uid());

-- Properties
create policy "members read properties" on public.properties for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert properties" on public.properties for insert to authenticated with check (public.can_edit_household(household_id));
create policy "editors update properties" on public.properties for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "editors delete properties" on public.properties for delete to authenticated using (public.can_edit_household(household_id));

-- Reservations
create policy "members read reservations" on public.reservations for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert reservations" on public.reservations for insert to authenticated with check (public.can_edit_household(household_id));
create policy "editors update reservations" on public.reservations for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "editors delete reservations" on public.reservations for delete to authenticated using (public.can_edit_household(household_id));

-- Payments
create policy "members read payments" on public.payments for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert payments" on public.payments for insert to authenticated with check (public.can_edit_household(household_id));
create policy "editors update payments" on public.payments for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "editors delete payments" on public.payments for delete to authenticated using (public.can_edit_household(household_id));

-- Expenses
create policy "members read expenses" on public.expenses for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert expenses" on public.expenses for insert to authenticated with check (public.can_edit_household(household_id));
create policy "editors update expenses" on public.expenses for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "editors delete expenses" on public.expenses for delete to authenticated using (public.can_edit_household(household_id));

-- Tasks: todos os membros podem concluir tarefas; criação/exclusão fica com owner/admin.
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert tasks" on public.tasks for insert to authenticated with check (public.can_edit_household(household_id));
create policy "members update tasks" on public.tasks for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "editors delete tasks" on public.tasks for delete to authenticated using (public.can_edit_household(household_id));

-- Índices úteis
create index if not exists reservations_household_dates_idx on public.reservations(household_id, check_in, check_out);
create index if not exists payments_household_date_idx on public.payments(household_id, paid_at);
create index if not exists expenses_household_date_idx on public.expenses(household_id, spent_at);
create index if not exists tasks_household_due_idx on public.tasks(household_id, due_date);
