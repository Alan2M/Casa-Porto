-- Atualização: Contas a pagar
-- Execute UMA VEZ no SQL Editor do Supabase do projeto que já está em produção.

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  category text not null default 'Outro',
  description text not null,
  status text not null default 'open' check (status in ('open','paid')),
  paid_at date,
  expense_id uuid unique references public.expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payable_paid_fields check ((status = 'open' and paid_at is null) or (status = 'paid' and paid_at is not null))
);

alter table public.payables enable row level security;

drop policy if exists "members read payables" on public.payables;
drop policy if exists "editors insert payables" on public.payables;
drop policy if exists "editors update payables" on public.payables;
drop policy if exists "editors delete payables" on public.payables;

create policy "members read payables" on public.payables for select to authenticated using (public.is_household_member(household_id));
create policy "editors insert payables" on public.payables for insert to authenticated with check (public.can_edit_household(household_id));
create policy "editors update payables" on public.payables for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "editors delete payables" on public.payables for delete to authenticated using (public.can_edit_household(household_id));

create or replace function public.mark_payable_paid(p_payable_id uuid, p_paid_at date default current_date)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_payable public.payables%rowtype;
  v_expense_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_payable from public.payables where id = p_payable_id for update;
  if v_payable.id is null then raise exception 'payable not found'; end if;
  if not public.can_edit_household(v_payable.household_id) then raise exception 'not allowed'; end if;
  if v_payable.status = 'paid' then return v_payable.expense_id; end if;
  insert into public.expenses(household_id, amount, spent_at, category, description)
  values (v_payable.household_id, v_payable.amount, p_paid_at, v_payable.category, v_payable.description)
  returning id into v_expense_id;
  update public.payables set status = 'paid', paid_at = p_paid_at, expense_id = v_expense_id where id = p_payable_id;
  return v_expense_id;
end;
$$;

revoke all on function public.mark_payable_paid(uuid,date) from public;
grant execute on function public.mark_payable_paid(uuid,date) to authenticated;

create index if not exists payables_household_due_idx on public.payables(household_id, due_date, status);
