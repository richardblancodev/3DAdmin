-- Add company-scoped RLS while preserving each existing user's data.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.companies (name, created_by)
select case
  when char_length(trim(coalesce(u.email, ''))) >= 2 then left(trim(u.email), 160)
  else 'Empresa migrada ' || u.id::text
end, u.id
from auth.users u
where not exists (
  select 1 from public.company_memberships m where m.user_id = u.id
);

insert into public.company_memberships (company_id, user_id, role)
select c.id, c.created_by, 'owner'
from public.companies c
where c.created_by is not null
on conflict (company_id, user_id) do nothing;

insert into public.user_profiles (user_id, active_company_id)
select u.id, m.company_id
from auth.users u
left join lateral (
  select cm.company_id
  from public.company_memberships cm
  where cm.user_id = u.id
  order by cm.created_at, cm.company_id
  limit 1
) m on true
on conflict (user_id) do update
set active_company_id = coalesce(
  public.user_profiles.active_company_id,
  excluded.active_company_id
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;

create or replace function public.current_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then return null; end if;

  select p.active_company_id into v_company_id
  from public.user_profiles p
  where p.user_id = auth.uid();

  if v_company_id is not null and (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.user_id = auth.uid()
    )
  ) then
    return v_company_id;
  end if;

  if public.is_platform_admin() then return null; end if;

  select m.company_id into v_company_id
  from public.company_memberships m
  where m.user_id = auth.uid()
  order by m.created_at, m.company_id
  limit 1;

  return v_company_id;
end;
$$;

create or replace function public.set_active_company(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;
  if not public.is_platform_admin() and not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = auth.uid()
  ) then
    raise exception 'No tienes acceso a esa empresa.';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'No se encontró la empresa seleccionada.';
  end if;

  insert into public.user_profiles (user_id, active_company_id)
  values (auth.uid(), p_company_id)
  on conflict (user_id) do update
  set active_company_id = excluded.active_company_id;

  return p_company_id;
end;
$$;

create or replace function public.get_current_access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'active_company_id', public.current_company_id(),
    'active_company_name', (
      select c.name
      from public.companies c
      where c.id = public.current_company_id()
    )
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

do $$
declare
  v_table text;
  v_constraint record;
  v_tables text[] := array[
    'suppliers', 'filament_rolls', 'hardware_items', 'printers', 'products',
    'inventory_movements', 'workshop_settings', 'customers', 'orders',
    'order_payments', 'order_refunds', 'order_product_returns'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I add column if not exists company_id uuid', v_table);
  end loop;

  foreach v_table in array v_tables loop
    execute format(
      'update public.%I t set company_id = m.company_id from public.company_memberships m where t.user_id = m.user_id and t.company_id is null',
      v_table
    );
    execute format(
      'alter table public.%I alter column company_id set default public.current_company_id()',
      v_table
    );
    execute format(
      'alter table public.%I alter column company_id set not null',
      v_table
    );
  end loop;

  for v_constraint in
    select c.conname, c.conrelid::regclass as table_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'user_id'
     and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = any(array(
        select format('public.%I', listed_tables.table_name)::regclass
        from unnest(v_tables) as listed_tables(table_name)
      ))
      and cardinality(c.conkey) > 1
  loop
    execute format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.conname
    );
  end loop;

  for v_constraint in
    select c.conname, c.conrelid::regclass as table_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'user_id'
     and a.attnum = any(c.conkey)
    where c.contype = 'u'
      and c.conrelid = any(array(
        select format('public.%I', listed_tables.table_name)::regclass
        from unnest(v_tables) as listed_tables(table_name)
      ))
  loop
    execute format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.workshop_settings drop constraint if exists workshop_settings_pkey;
alter table public.workshop_settings add constraint workshop_settings_pkey primary key (company_id);

do $$
declare
  v_table text;
  v_tables text[] := array[
    'suppliers', 'filament_rolls', 'hardware_items', 'printers', 'products',
    'inventory_movements', 'customers', 'orders', 'order_payments',
    'order_refunds', 'order_product_returns'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'alter table public.%I add constraint %I unique (company_id, id)',
      v_table,
      v_table || '_company_id_id_key'
    );
  end loop;
end;
$$;

alter table public.suppliers
  add constraint suppliers_company_name_key unique (company_id, name);
alter table public.products
  add constraint products_company_name_key unique (company_id, name);
alter table public.customers
  add constraint customers_company_email_key unique (company_id, email);
alter table public.order_payments
  add constraint order_payments_company_order_id_key unique (company_id, order_id, id);
alter table public.order_product_returns
  add constraint order_product_returns_company_order_id_key unique (company_id, order_id, id);

alter table public.filament_rolls
  add constraint filament_rolls_company_supplier_fk
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id);
alter table public.hardware_items
  add constraint hardware_items_company_supplier_fk
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id);
alter table public.inventory_movements
  add constraint inventory_movements_company_filament_fk
  foreign key (company_id, filament_roll_id) references public.filament_rolls (company_id, id) on delete restrict,
  add constraint inventory_movements_company_hardware_fk
  foreign key (company_id, hardware_item_id) references public.hardware_items (company_id, id) on delete restrict;
alter table public.orders
  add constraint orders_company_customer_fk
    foreign key (company_id, customer_id) references public.customers (company_id, id) on delete restrict,
  add constraint orders_company_product_fk
    foreign key (company_id, product_id) references public.products (company_id, id) on delete restrict,
  add constraint orders_company_filament_fk
    foreign key (company_id, filament_roll_id) references public.filament_rolls (company_id, id) on delete restrict,
  add constraint orders_company_printer_fk
    foreign key (company_id, printer_id) references public.printers (company_id, id) on delete restrict;
alter table public.order_payments
  add constraint order_payments_company_order_fk
  foreign key (company_id, order_id) references public.orders (company_id, id) on delete restrict;
alter table public.order_refunds
  add constraint order_refunds_company_order_fk
  foreign key (company_id, order_id) references public.orders (company_id, id) on delete restrict,
  add constraint order_refunds_company_payment_fk
  foreign key (company_id, order_id, payment_id)
  references public.order_payments (company_id, order_id, id) on delete restrict;
alter table public.order_product_returns
  add constraint order_product_returns_company_order_fk
  foreign key (company_id, order_id) references public.orders (company_id, id) on delete restrict;
alter table public.order_refunds
  add constraint order_refunds_company_return_fk
  foreign key (company_id, order_id, product_return_id)
  references public.order_product_returns (company_id, order_id, id) on delete restrict;

do $$
declare
  v_table text;
  v_policy record;
  v_tables text[] := array[
    'suppliers', 'filament_rolls', 'hardware_items', 'printers', 'products',
    'inventory_movements', 'workshop_settings', 'customers', 'orders',
    'order_payments', 'order_refunds', 'order_product_returns'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable row level security', v_table);
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;
  end loop;
end;
$$;

create policy "Company members manage suppliers" on public.suppliers
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage filament rolls" on public.filament_rolls
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage hardware" on public.hardware_items
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage printers" on public.printers
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage products" on public.products
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage inventory movements" on public.inventory_movements
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage workshop settings" on public.workshop_settings
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
create policy "Company members manage customers" on public.customers
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy "Company members read orders" on public.orders
  for select to authenticated
  using (company_id = public.current_company_id());
create policy "Company members create pending orders" on public.orders
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and user_id = auth.uid()
    and status = 'pending'
  );
create policy "Creators delete their pending orders" on public.orders
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and user_id = auth.uid()
    and status = 'pending'
  );
create policy "Company members read order payments" on public.order_payments
  for select to authenticated
  using (company_id = public.current_company_id());
create policy "Company members read order refunds" on public.order_refunds
  for select to authenticated
  using (company_id = public.current_company_id());
create policy "Company members read product returns" on public.order_product_returns
  for select to authenticated
  using (company_id = public.current_company_id());

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.user_profiles enable row level security;

create policy "Users read their companies" on public.companies
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id and m.user_id = auth.uid()
    )
  );
create policy "Platform admins read memberships" on public.company_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy "Users read own profile" on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy "Platform admins read own admin status" on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

do $$
declare
  v_definition text;
  v_function record;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'record_inventory_movement', 'create_filament_roll', 'update_filament_roll',
        'create_hardware_item', 'update_hardware_item', 'transition_order_status',
        'record_order_refund', 'record_delivered_product_return',
        'cancel_work_order', 'cancel_pending_order', 'record_order_payment'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, 'user_id = v_user_id', 'company_id = public.current_company_id()');
    v_definition := replace(v_definition, 'user_id = auth.uid()', 'company_id = public.current_company_id()');
    execute v_definition;
  end loop;
end;
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.current_company_id() from public;
revoke all on function public.set_active_company(uuid) from public;
revoke all on function public.get_current_access_context() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.set_active_company(uuid) to authenticated;
grant execute on function public.get_current_access_context() to authenticated;

grant select on public.companies to authenticated;
grant select on public.company_memberships to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.user_profiles to authenticated;
revoke all on public.companies, public.company_memberships,
  public.platform_admins, public.user_profiles from anon, public;
grant select on public.companies, public.company_memberships,
  public.platform_admins, public.user_profiles to authenticated;
grant all on public.companies, public.company_memberships,
  public.platform_admins, public.user_profiles to service_role;
revoke insert, update, delete on public.companies from anon, authenticated;
revoke insert, update, delete on public.company_memberships from anon, authenticated;
revoke insert, update, delete on public.platform_admins from anon, authenticated;
revoke insert, update, delete on public.user_profiles from anon, authenticated;
