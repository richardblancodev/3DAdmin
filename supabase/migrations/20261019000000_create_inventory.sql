create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table if not exists public.filament_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  supplier_id uuid,
  brand text not null check (char_length(trim(brand)) between 1 and 100),
  material text not null check (material in ('PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'OTHER')),
  color text not null check (char_length(trim(color)) between 1 and 80),
  initial_weight_g numeric(10, 2) not null check (initial_weight_g > 0),
  remaining_weight_g numeric(10, 2) not null check (remaining_weight_g >= 0 and remaining_weight_g <= initial_weight_g),
  cost numeric(12, 2) not null check (cost >= 0),
  status text not null default 'active' check (status in ('active', 'depleted', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, supplier_id) references public.suppliers (user_id, id)
);

create table if not exists public.hardware_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  supplier_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text not null check (char_length(trim(category)) between 1 and 80),
  quantity numeric(10, 2) not null default 0 check (quantity >= 0),
  unit text not null default 'unidad' check (char_length(trim(unit)) between 1 and 30),
  minimum_quantity numeric(10, 2) not null default 0 check (minimum_quantity >= 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, supplier_id) references public.suppliers (user_id, id)
);

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  model text,
  power_w numeric(10, 2) not null default 200 check (power_w >= 0),
  wear_per_hour numeric(12, 2) not null default 0 check (wear_per_hour >= 0),
  status text not null default 'available' check (status in ('available', 'printing', 'maintenance', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text,
  description text,
  material text,
  grams_per_unit numeric(10, 2) not null default 0 check (grams_per_unit >= 0),
  hours_per_unit numeric(10, 2) not null default 0 check (hours_per_unit >= 0),
  post_processing_hours_per_unit numeric(10, 2) not null default 0
    check (post_processing_hours_per_unit >= 0),
  default_price numeric(12, 2) not null default 0 check (default_price >= 0),
  vat_rate numeric(5, 4) check (vat_rate >= 0 and vat_rate <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  filament_roll_id uuid,
  hardware_item_id uuid,
  movement_type text not null check (movement_type in ('purchase', 'consumption', 'adjustment')),
  quantity numeric(10, 2) not null,
  unit text not null check (char_length(trim(unit)) between 1 and 30),
  purchase_total numeric(12, 2) not null default 0 check (purchase_total >= 0),
  purchase_vat_amount numeric(12, 2) not null default 0 check (
    purchase_vat_amount >= 0 and purchase_vat_amount <= purchase_total
  ),
  purchase_vat_treatment text not null default 'included_in_cost'
    check (purchase_vat_treatment in ('included_in_cost', 'deductible')),
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_movement_one_item check (
    (filament_roll_id is not null and hardware_item_id is null)
    or (filament_roll_id is null and hardware_item_id is not null)
  ),
  foreign key (user_id, filament_roll_id) references public.filament_rolls (user_id, id) on delete restrict,
  foreign key (user_id, hardware_item_id) references public.hardware_items (user_id, id) on delete restrict
);

create table if not exists public.workshop_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  energy_rate_per_kwh numeric(12, 2) not null default 0 check (energy_rate_per_kwh >= 0),
  printer_power_w numeric(10, 2) not null default 200 check (printer_power_w >= 0),
  machine_wear_per_hour numeric(12, 2) not null default 0 check (machine_wear_per_hour >= 0),
  labor_rate_per_hour numeric(12, 2) not null default 0 check (labor_rate_per_hour >= 0),
  default_margin_percent numeric(7, 2) not null default 30 check (default_margin_percent >= 0),
  currency_code text not null default 'COP' check (currency_code ~ '^[A-Z]{3}$'),
  entity_type text not null default 'NATURAL_PERSON'
    check (entity_type in ('NATURAL_PERSON', 'JURIDICAL_PERSON_SAS')),
  is_vat_responsible boolean not null default false,
  default_vat_rate numeric(5, 4) not null default 0.19
    check (default_vat_rate >= 0 and default_vat_rate <= 1),
  tax_regime text not null default 'NOT_APPLICABLE'
    check (tax_regime in ('NOT_APPLICABLE', 'ORDINARY', 'SIMPLE')),
  invoice_prefix text not null default 'COT'
    check (invoice_prefix ~ '^[A-Z0-9-]{2,10}$'),
  business_name text not null default 'Taller de impresión 3D'
    check (char_length(trim(business_name)) between 1 and 160),
  tax_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email),
  unique (user_id, id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  customer_id uuid,
  product_id uuid,
  filament_roll_id uuid,
  printer_id uuid,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 120),
  product_name text not null check (char_length(trim(product_name)) between 1 and 160),
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'pending' check (status in ('pending', 'printing', 'post_processing', 'delivered')),
  due_date date,
  material_cost numeric(12, 2) not null default 0 check (material_cost >= 0),
  energy_cost numeric(12, 2) not null default 0 check (energy_cost >= 0),
  machine_wear_cost numeric(12, 2) not null default 0 check (machine_wear_cost >= 0),
  labor_cost numeric(12, 2) not null default 0 check (labor_cost >= 0),
  filament_grams_per_unit numeric(10, 2) not null default 0 check (filament_grams_per_unit >= 0),
  print_hours_per_unit numeric(10, 2) not null default 0 check (print_hours_per_unit >= 0),
  post_processing_hours_per_unit numeric(10, 2) not null default 0
    check (post_processing_hours_per_unit >= 0),
  suggested_price numeric(12, 2) not null default 0 check (suggested_price >= 0),
  sale_price numeric(12, 2) not null default 0 check (sale_price >= 0),
  sale_subtotal numeric(12, 2) not null default 0 check (sale_subtotal >= 0),
  vat_rate numeric(5, 4) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  fiscal_entity_type text not null default 'NATURAL_PERSON'
    check (fiscal_entity_type in ('NATURAL_PERSON', 'JURIDICAL_PERSON_SAS')),
  is_vat_responsible boolean not null default false,
  fiscal_tax_regime text not null default 'NOT_APPLICABLE'
    check (fiscal_tax_regime in ('NOT_APPLICABLE', 'ORDINARY', 'SIMPLE')),
  fiscal_business_name text not null default 'Taller de impresión 3D',
  fiscal_tax_id text,
  document_prefix text not null default 'COT'
    check (document_prefix ~ '^[A-Z0-9-]{2,10}$'),
  currency_code text not null default 'COP' check (currency_code ~ '^[A-Z]{3}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, customer_id) references public.customers (user_id, id) on delete restrict
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'transfer', 'card', 'other')),
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_user_id_id_key'
  ) then
    alter table public.orders
      add constraint orders_user_id_id_key unique (user_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_payments'::regclass
      and conname = 'order_payments_user_order_id_key'
  ) then
    alter table public.order_payments
      add constraint order_payments_user_order_id_key unique (user_id, order_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_payments'::regclass
      and conname = 'order_payments_user_order_fk'
  ) then
    alter table public.order_payments
      add constraint order_payments_user_order_fk
      foreign key (user_id, order_id)
      references public.orders (user_id, id) on delete restrict;
  end if;
end;
$$;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null,
  payment_id uuid not null,
  product_return_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  refund_method text not null check (refund_method in ('cash', 'transfer', 'card', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (user_id, order_id)
    references public.orders (user_id, id) on delete restrict,
  foreign key (user_id, order_id, payment_id)
    references public.order_payments (user_id, order_id, id) on delete restrict
);

create table if not exists public.order_product_returns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null,
  quantity integer not null check (quantity > 0),
  item_condition text not null check (item_condition in ('resalable', 'repair', 'scrap')),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, order_id, id),
  foreign key (user_id, order_id)
    references public.orders (user_id, id) on delete restrict
);

alter table public.order_refunds add column if not exists product_return_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_refunds'::regclass
      and conname = 'order_refunds_product_return_fk'
  ) then
    alter table public.order_refunds
      add constraint order_refunds_product_return_fk
      foreign key (user_id, order_id, product_return_id)
      references public.order_product_returns (user_id, order_id, id)
      on delete restrict;
  end if;
end;
$$;

alter table public.orders add column if not exists product_id uuid;
alter table public.orders add column if not exists filament_roll_id uuid;
alter table public.orders add column if not exists printer_id uuid;
alter table public.orders add column if not exists filament_grams_per_unit numeric(10, 2) not null default 0;
alter table public.orders add column if not exists print_hours_per_unit numeric(10, 2) not null default 0;
alter table public.orders add column if not exists post_processing_hours_per_unit numeric(10, 2) not null default 0;
alter table public.orders add column if not exists labor_cost numeric(12, 2) not null default 0;
alter table public.products add column if not exists post_processing_hours_per_unit numeric(10, 2) not null default 0;
alter table public.workshop_settings add column if not exists currency_code text not null default 'COP';
alter table public.workshop_settings add column if not exists labor_rate_per_hour numeric(12, 2) not null default 0;
alter table public.workshop_settings add column if not exists entity_type text not null default 'NATURAL_PERSON';
alter table public.workshop_settings add column if not exists is_vat_responsible boolean not null default false;
alter table public.workshop_settings add column if not exists default_vat_rate numeric(5, 4) not null default 0.19;
alter table public.workshop_settings add column if not exists tax_regime text not null default 'NOT_APPLICABLE';
alter table public.workshop_settings add column if not exists invoice_prefix text not null default 'COT';
alter table public.workshop_settings add column if not exists business_name text not null default 'Taller de impresión 3D';
alter table public.workshop_settings add column if not exists tax_id text;
alter table public.products add column if not exists vat_rate numeric(5, 4);
alter table public.inventory_movements add column if not exists purchase_total numeric(12, 2) not null default 0;
alter table public.inventory_movements add column if not exists purchase_vat_amount numeric(12, 2) not null default 0;
alter table public.inventory_movements add column if not exists purchase_vat_treatment text not null default 'included_in_cost';
alter table public.orders add column if not exists sale_subtotal numeric(12, 2) not null default 0;
alter table public.orders add column if not exists vat_rate numeric(5, 4) not null default 0;
alter table public.orders add column if not exists vat_amount numeric(12, 2) not null default 0;
alter table public.orders add column if not exists fiscal_entity_type text not null default 'NATURAL_PERSON';
alter table public.orders add column if not exists is_vat_responsible boolean not null default false;
alter table public.orders add column if not exists fiscal_tax_regime text not null default 'NOT_APPLICABLE';
alter table public.orders add column if not exists fiscal_business_name text not null default 'Taller de impresión 3D';
alter table public.orders add column if not exists fiscal_tax_id text;
alter table public.orders add column if not exists document_prefix text not null default 'COT';
alter table public.orders add column if not exists currency_code text not null default 'COP';
update public.orders set sale_subtotal = sale_price where sale_subtotal = 0 and sale_price > 0;
alter table public.workshop_settings drop constraint if exists workshop_settings_entity_type_check;
alter table public.workshop_settings add constraint workshop_settings_entity_type_check
  check (entity_type in ('NATURAL_PERSON', 'JURIDICAL_PERSON_SAS'));
alter table public.workshop_settings drop constraint if exists workshop_settings_default_vat_rate_check;
alter table public.workshop_settings add constraint workshop_settings_default_vat_rate_check
  check (default_vat_rate >= 0 and default_vat_rate <= 1);
alter table public.workshop_settings drop constraint if exists workshop_settings_tax_regime_check;
alter table public.workshop_settings add constraint workshop_settings_tax_regime_check
  check (tax_regime in ('NOT_APPLICABLE', 'ORDINARY', 'SIMPLE'));
alter table public.workshop_settings drop constraint if exists workshop_settings_invoice_prefix_check;
alter table public.workshop_settings add constraint workshop_settings_invoice_prefix_check
  check (invoice_prefix ~ '^[A-Z0-9-]{2,10}$');
alter table public.workshop_settings drop constraint if exists workshop_settings_business_name_check;
alter table public.workshop_settings add constraint workshop_settings_business_name_check
  check (char_length(trim(business_name)) between 1 and 160);
alter table public.workshop_settings drop constraint if exists workshop_settings_labor_rate_per_hour_check;
alter table public.workshop_settings add constraint workshop_settings_labor_rate_per_hour_check
  check (labor_rate_per_hour >= 0);
alter table public.products drop constraint if exists products_vat_rate_check;
alter table public.products add constraint products_vat_rate_check
  check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 1));
alter table public.products drop constraint if exists products_post_processing_hours_per_unit_check;
alter table public.products add constraint products_post_processing_hours_per_unit_check
  check (post_processing_hours_per_unit >= 0);
alter table public.inventory_movements drop constraint if exists inventory_movements_purchase_amount_check;
alter table public.inventory_movements add constraint inventory_movements_purchase_amount_check
  check (purchase_total >= 0 and purchase_vat_amount >= 0 and purchase_vat_amount <= purchase_total);
alter table public.inventory_movements drop constraint if exists inventory_movements_purchase_vat_treatment_check;
alter table public.inventory_movements add constraint inventory_movements_purchase_vat_treatment_check
  check (purchase_vat_treatment in ('included_in_cost', 'deductible'));
alter table public.orders drop constraint if exists orders_fiscal_entity_type_check;
alter table public.orders add constraint orders_fiscal_entity_type_check
  check (fiscal_entity_type in ('NATURAL_PERSON', 'JURIDICAL_PERSON_SAS'));
alter table public.orders drop constraint if exists orders_fiscal_tax_regime_check;
alter table public.orders add constraint orders_fiscal_tax_regime_check
  check (fiscal_tax_regime in ('NOT_APPLICABLE', 'ORDINARY', 'SIMPLE'));
alter table public.orders drop constraint if exists orders_fiscal_business_name_check;
alter table public.orders add constraint orders_fiscal_business_name_check
  check (char_length(trim(fiscal_business_name)) between 1 and 160);
alter table public.orders drop constraint if exists orders_document_prefix_check;
alter table public.orders add constraint orders_document_prefix_check
  check (document_prefix ~ '^[A-Z0-9-]{2,10}$');
alter table public.orders drop constraint if exists orders_currency_code_check;
alter table public.orders add constraint orders_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');
alter table public.orders drop constraint if exists orders_vat_rate_check;
alter table public.orders add constraint orders_vat_rate_check
  check (vat_rate >= 0 and vat_rate <= 1 and vat_amount >= 0);
alter table public.orders drop constraint if exists orders_sale_subtotal_check;
alter table public.orders add constraint orders_sale_subtotal_check
  check (sale_subtotal >= 0);
alter table public.orders drop constraint if exists orders_post_processing_hours_per_unit_check;
alter table public.orders add constraint orders_post_processing_hours_per_unit_check
  check (post_processing_hours_per_unit >= 0);
alter table public.orders drop constraint if exists orders_labor_cost_check;
alter table public.orders add constraint orders_labor_cost_check
  check (labor_cost >= 0);
alter table public.orders drop constraint if exists orders_tax_total_check;
alter table public.orders add constraint orders_tax_total_check
  check (sale_price = sale_subtotal + vat_amount);
alter table public.filament_rolls add column if not exists supplier_id uuid;
alter table public.hardware_items add column if not exists supplier_id uuid;
alter table public.filament_rolls drop constraint if exists filament_rolls_user_id_supplier_id_fkey;
alter table public.filament_rolls drop constraint if exists filament_rolls_supplier_user_fk;
alter table public.filament_rolls add constraint filament_rolls_supplier_user_fk
  foreign key (user_id, supplier_id) references public.suppliers (user_id, id);
alter table public.hardware_items drop constraint if exists hardware_items_user_id_supplier_id_fkey;
alter table public.hardware_items drop constraint if exists hardware_items_supplier_user_fk;
alter table public.hardware_items add constraint hardware_items_supplier_user_fk
  foreign key (user_id, supplier_id) references public.suppliers (user_id, id);
alter table public.workshop_settings drop constraint if exists workshop_settings_currency_code_check;
alter table public.workshop_settings add constraint workshop_settings_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'printing', 'post_processing', 'delivered', 'cancelled'));
alter table public.orders drop constraint if exists orders_filament_grams_nonnegative;
alter table public.orders add constraint orders_filament_grams_nonnegative check (filament_grams_per_unit >= 0);
alter table public.orders drop constraint if exists orders_print_hours_nonnegative;
alter table public.orders add constraint orders_print_hours_nonnegative check (print_hours_per_unit >= 0);
alter table public.inventory_movements drop constraint if exists inventory_movements_quantity_check;
alter table public.inventory_movements drop constraint if exists inventory_movements_quantity_nonzero;
alter table public.inventory_movements add constraint inventory_movements_quantity_nonzero check (quantity <> 0);
alter table public.orders drop constraint if exists orders_user_product_fk;
alter table public.orders add constraint orders_user_product_fk
  foreign key (user_id, product_id) references public.products (user_id, id) on delete restrict;
alter table public.orders drop constraint if exists orders_user_filament_fk;
alter table public.orders add constraint orders_user_filament_fk
  foreign key (user_id, filament_roll_id) references public.filament_rolls (user_id, id) on delete restrict;
alter table public.orders drop constraint if exists orders_user_printer_fk;
alter table public.orders add constraint orders_user_printer_fk
  foreign key (user_id, printer_id) references public.printers (user_id, id) on delete restrict;

insert into public.inventory_movements (
  user_id, filament_roll_id, movement_type, quantity, unit, notes
)
select roll.user_id, roll.id, 'adjustment', roll.remaining_weight_g, 'g',
       'Saldo inicial al habilitar el historial'
from public.filament_rolls as roll
where roll.remaining_weight_g > 0
  and not exists (
    select 1 from public.inventory_movements as movement
    where movement.filament_roll_id = roll.id
  );

insert into public.inventory_movements (
  user_id, hardware_item_id, movement_type, quantity, unit, notes
)
select item.user_id, item.id, 'adjustment', item.quantity, item.unit,
       'Saldo inicial al habilitar el historial'
from public.hardware_items as item
where item.quantity > 0
  and not exists (
    select 1 from public.inventory_movements as movement
    where movement.hardware_item_id = item.id
  );

create index if not exists filament_rolls_user_created_idx on public.filament_rolls (user_id, created_at desc);
create index if not exists hardware_items_user_name_idx on public.hardware_items (user_id, name);
create index if not exists inventory_movements_user_created_idx on public.inventory_movements (user_id, created_at desc);
create index if not exists inventory_movements_filament_idx on public.inventory_movements (filament_roll_id) where filament_roll_id is not null;
create index if not exists inventory_movements_hardware_idx on public.inventory_movements (hardware_item_id) where hardware_item_id is not null;
create index if not exists customers_user_name_idx on public.customers (user_id, name);
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_user_status_idx on public.orders (user_id, status);
create index if not exists order_payments_user_created_idx on public.order_payments (user_id, created_at desc);
create index if not exists order_payments_user_order_created_idx on public.order_payments (user_id, order_id, created_at desc);
create index if not exists order_refunds_user_created_idx on public.order_refunds (user_id, created_at desc);
create index if not exists order_refunds_user_payment_created_idx on public.order_refunds (user_id, payment_id, created_at desc);
create index if not exists order_product_returns_user_created_idx on public.order_product_returns (user_id, created_at desc);
create index if not exists order_product_returns_user_order_created_idx on public.order_product_returns (user_id, order_id, created_at desc);
create index if not exists printers_user_name_idx on public.printers (user_id, name);
create index if not exists products_user_name_idx on public.products (user_id, name);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
drop trigger if exists filament_rolls_set_updated_at on public.filament_rolls;
create trigger filament_rolls_set_updated_at before update on public.filament_rolls
for each row execute function public.set_updated_at();
drop trigger if exists hardware_items_set_updated_at on public.hardware_items;
create trigger hardware_items_set_updated_at before update on public.hardware_items
for each row execute function public.set_updated_at();
drop trigger if exists workshop_settings_set_updated_at on public.workshop_settings;
create trigger workshop_settings_set_updated_at before update on public.workshop_settings
for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
drop trigger if exists printers_set_updated_at on public.printers;
create trigger printers_set_updated_at before update on public.printers
for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.filament_rolls enable row level security;
alter table public.hardware_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.workshop_settings enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.printers enable row level security;
alter table public.products enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_refunds enable row level security;
alter table public.order_product_returns enable row level security;

drop policy if exists "Users manage their own suppliers" on public.suppliers;
drop policy if exists "Users manage their own filament rolls" on public.filament_rolls;
drop policy if exists "Users manage their own hardware" on public.hardware_items;
drop policy if exists "Users manage their own inventory movements" on public.inventory_movements;
drop policy if exists "Users manage their own workshop settings" on public.workshop_settings;
drop policy if exists "Users manage their own customers" on public.customers;
drop policy if exists "Users manage their own orders" on public.orders;
drop policy if exists "Users read their own orders" on public.orders;
drop policy if exists "Users create pending orders" on public.orders;
drop policy if exists "Users delete their own orders" on public.orders;
drop policy if exists "Users manage their own printers" on public.printers;
drop policy if exists "Users manage their own products" on public.products;
drop policy if exists "Users read their own order payments" on public.order_payments;
drop policy if exists "Users read their own order refunds" on public.order_refunds;
drop policy if exists "Users read their own product returns" on public.order_product_returns;

create policy "Users manage their own suppliers" on public.suppliers
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own filament rolls" on public.filament_rolls
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own hardware" on public.hardware_items
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own inventory movements" on public.inventory_movements
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own workshop settings" on public.workshop_settings
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own customers" on public.customers
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users read their own orders" on public.orders
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create pending orders" on public.orders
for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');
create policy "Users delete their own orders" on public.orders
for delete to authenticated using ((select auth.uid()) = user_id and status = 'pending');
create policy "Users manage their own printers" on public.printers
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users manage their own products" on public.products
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users read their own order payments" on public.order_payments
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own order refunds" on public.order_refunds
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their own product returns" on public.order_product_returns
for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.filament_rolls to authenticated;
grant select, insert, update, delete on public.hardware_items to authenticated;
grant select, insert, update, delete on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.workshop_settings to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.printers to authenticated;
grant select, insert, update, delete on public.products to authenticated;
revoke all on public.order_payments from anon, authenticated, public;
grant select on public.order_payments to authenticated;
revoke all on public.order_refunds from anon, authenticated, public;
grant select on public.order_refunds to authenticated;
revoke all on public.order_product_returns from anon, authenticated, public;
grant select on public.order_product_returns to authenticated;

drop function if exists public.record_inventory_movement(uuid, uuid, text, numeric, text);
create or replace function public.record_inventory_movement(
  p_filament_roll_id uuid,
  p_hardware_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_purchase_total numeric,
  p_purchase_vat_amount numeric,
  p_purchase_vat_treatment text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_movement_id uuid;
  v_delta numeric;
  v_remaining numeric;
  v_current numeric;
  v_unit text;
  v_is_vat_responsible boolean;
begin
  if v_user_id is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;
  if p_quantity = 0 or p_quantity is null then
    raise exception 'La cantidad del movimiento no puede ser cero.';
  end if;
  if p_movement_type not in ('purchase', 'consumption', 'adjustment') then
    raise exception 'Tipo de movimiento inválido.';
  end if;
  if (p_filament_roll_id is null) = (p_hardware_item_id is null) then
    raise exception 'El movimiento debe identificar exactamente un artículo.';
  end if;
  if p_movement_type in ('purchase', 'consumption') and p_quantity < 0 then
    raise exception 'Compras y consumos deben indicarse con una cantidad positiva.';
  end if;
  if p_purchase_total is null or p_purchase_total < 0
     or p_purchase_vat_amount is null or p_purchase_vat_amount < 0
     or p_purchase_vat_amount > p_purchase_total then
    raise exception 'El total de compra y el IVA deben ser válidos.';
  end if;
  if p_purchase_vat_treatment is null
     or p_purchase_vat_treatment not in ('included_in_cost', 'deductible') then
    raise exception 'El tratamiento del IVA de compra no es válido.';
  end if;
  if p_movement_type <> 'purchase'
     and (p_purchase_total <> 0 or p_purchase_vat_amount <> 0) then
    raise exception 'Solo las compras pueden registrar importes e IVA.';
  end if;
  if p_movement_type <> 'purchase' and p_purchase_vat_treatment <> 'included_in_cost' then
    raise exception 'El tratamiento del IVA solo aplica a compras.';
  end if;
  if p_movement_type = 'purchase' and p_purchase_vat_treatment = 'deductible' then
    select is_vat_responsible into v_is_vat_responsible
    from public.workshop_settings
    where user_id = v_user_id;
    if not coalesce(v_is_vat_responsible, false) then
      raise exception 'El IVA descontable requiere que la cuenta esté configurada como responsable de IVA.';
    end if;
  end if;
  v_delta := case when p_movement_type = 'consumption' then -p_quantity else p_quantity end;

  if p_filament_roll_id is not null then
    select remaining_weight_g into v_remaining
    from public.filament_rolls
    where id = p_filament_roll_id and user_id = v_user_id
    for update;
    if not found then raise exception 'No se encontró la bobina para este usuario.'; end if;
    if v_remaining + v_delta < 0 then raise exception 'El movimiento supera el filamento disponible.'; end if;
    update public.filament_rolls
    set remaining_weight_g = v_remaining + v_delta,
        status = case when v_remaining + v_delta = 0 then 'depleted' else 'active' end
    where id = p_filament_roll_id and user_id = v_user_id;
  else
    select quantity, unit into v_current, v_unit
    from public.hardware_items
    where id = p_hardware_item_id and user_id = v_user_id
    for update;
    if not found then raise exception 'No se encontró el artículo para este usuario.'; end if;
    if v_current + v_delta < 0 then raise exception 'El movimiento supera la existencia disponible.'; end if;
    update public.hardware_items
    set quantity = v_current + v_delta
    where id = p_hardware_item_id and user_id = v_user_id;
  end if;

  insert into public.inventory_movements (
    user_id, filament_roll_id, hardware_item_id, movement_type, quantity, unit,
    purchase_total, purchase_vat_amount, purchase_vat_treatment, notes
  ) values (
    v_user_id, p_filament_roll_id, p_hardware_item_id, p_movement_type,
    v_delta, case when p_filament_roll_id is not null then 'g' else v_unit end,
    p_purchase_total, p_purchase_vat_amount, p_purchase_vat_treatment, p_notes
  ) returning id into v_movement_id;
  return v_movement_id;
end;
$$;

drop function if exists public.create_filament_roll(text, text, text, numeric, numeric);
drop function if exists public.create_filament_roll(text, text, text, numeric, numeric, uuid);
create or replace function public.create_filament_roll(
  p_brand text,
  p_material text,
  p_color text,
  p_initial_weight_g numeric,
  p_cost numeric,
  p_supplier_id uuid,
  p_purchase_total numeric,
  p_purchase_vat_amount numeric,
  p_purchase_vat_treatment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_roll_id uuid;
  v_is_vat_responsible boolean;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_purchase_total is null or p_purchase_total < 0
     or p_purchase_vat_amount is null or p_purchase_vat_amount < 0
     or p_purchase_vat_amount > p_purchase_total then
    raise exception 'El total de compra y el IVA deben ser válidos.';
  end if;
  if p_purchase_vat_treatment is null
     or p_purchase_vat_treatment not in ('included_in_cost', 'deductible') then
    raise exception 'El tratamiento del IVA de compra no es válido.';
  end if;
  if p_purchase_vat_treatment = 'deductible' then
    select is_vat_responsible into v_is_vat_responsible
    from public.workshop_settings where user_id = v_user_id;
    if not coalesce(v_is_vat_responsible, false) then
      raise exception 'El IVA descontable requiere que la cuenta esté configurada como responsable de IVA.';
    end if;
    if round(p_cost, 2) <> round(p_purchase_total - p_purchase_vat_amount, 2) then
      raise exception 'El costo de la bobina debe excluir exactamente el IVA descontable registrado.';
    end if;
  end if;
  insert into public.filament_rolls (
    user_id, supplier_id, brand, material, color, initial_weight_g, remaining_weight_g, cost
  ) values (
    v_user_id, p_supplier_id, p_brand, p_material, p_color, p_initial_weight_g, p_initial_weight_g, p_cost
  ) returning id into v_roll_id;
  insert into public.inventory_movements (
    user_id, filament_roll_id, movement_type, quantity, unit,
    purchase_total, purchase_vat_amount, purchase_vat_treatment, notes
  ) values (
    v_user_id, v_roll_id, 'purchase', p_initial_weight_g, 'g',
    p_purchase_total, p_purchase_vat_amount, p_purchase_vat_treatment,
    'Registro inicial de la bobina'
  );
  return v_roll_id;
end;
$$;

drop function if exists public.update_filament_roll(uuid, text, text, text, numeric, uuid);
create or replace function public.update_filament_roll(
  p_roll_id uuid,
  p_brand text,
  p_material text,
  p_color text,
  p_cost numeric,
  p_supplier_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  update public.filament_rolls
  set brand = p_brand,
      material = p_material,
      color = p_color,
      cost = p_cost,
      supplier_id = p_supplier_id
  where id = p_roll_id and user_id = auth.uid();
  if not found then raise exception 'No se encontró la bobina para este usuario.'; end if;
end;
$$;

drop function if exists public.create_hardware_item(text, text, numeric, text, numeric, numeric, text);
drop function if exists public.create_hardware_item(text, text, numeric, text, numeric, numeric, uuid, text);
create or replace function public.create_hardware_item(
  p_name text,
  p_category text,
  p_quantity numeric,
  p_unit text,
  p_minimum_quantity numeric,
  p_cost numeric,
  p_supplier_id uuid,
  p_notes text,
  p_purchase_total numeric,
  p_purchase_vat_amount numeric,
  p_purchase_vat_treatment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_is_vat_responsible boolean;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_purchase_total is null or p_purchase_total < 0
     or p_purchase_vat_amount is null or p_purchase_vat_amount < 0
     or p_purchase_vat_amount > p_purchase_total then
    raise exception 'El total de compra y el IVA deben ser válidos.';
  end if;
  if p_purchase_vat_treatment is null
     or p_purchase_vat_treatment not in ('included_in_cost', 'deductible') then
    raise exception 'El tratamiento del IVA de compra no es válido.';
  end if;
  if p_purchase_vat_treatment = 'deductible' then
    select is_vat_responsible into v_is_vat_responsible
    from public.workshop_settings where user_id = v_user_id;
    if not coalesce(v_is_vat_responsible, false) then
      raise exception 'El IVA descontable requiere que la cuenta esté configurada como responsable de IVA.';
    end if;
    if p_quantity <= 0
       or round(p_cost * p_quantity, 2) <> round(p_purchase_total - p_purchase_vat_amount, 2) then
      raise exception 'El costo total del artículo debe excluir exactamente el IVA descontable registrado.';
    end if;
  end if;
  insert into public.hardware_items (
    user_id, supplier_id, name, category, quantity, unit, minimum_quantity, cost, notes
  ) values (
    v_user_id, p_supplier_id, p_name, p_category, p_quantity, p_unit, p_minimum_quantity, p_cost, p_notes
  ) returning id into v_item_id;
  if p_quantity > 0 then
    insert into public.inventory_movements (
      user_id, hardware_item_id, movement_type, quantity, unit,
      purchase_total, purchase_vat_amount, purchase_vat_treatment, notes
    ) values (
      v_user_id, v_item_id, 'purchase', p_quantity, p_unit,
      p_purchase_total, p_purchase_vat_amount, p_purchase_vat_treatment,
      'Existencia inicial'
    );
  end if;
  return v_item_id;
end;
$$;

drop function if exists public.update_hardware_item(uuid, text, text, numeric, numeric, text);
create or replace function public.update_hardware_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_minimum_quantity numeric,
  p_cost numeric,
  p_supplier_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  update public.hardware_items
  set name = p_name,
      category = p_category,
      minimum_quantity = p_minimum_quantity,
      cost = p_cost,
      supplier_id = p_supplier_id,
      notes = p_notes
  where id = p_item_id and user_id = auth.uid();
  if not found then raise exception 'No se encontró el artículo para este usuario.'; end if;
end;
$$;

create or replace function public.transition_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_roll public.filament_rolls%rowtype;
  v_required numeric;
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_status not in ('pending', 'printing', 'post_processing', 'delivered') then
    raise exception 'Estado de pedido inválido.';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'No se encontró el pedido para este usuario.'; end if;

  if v_order.status = p_status then return; end if;
  if not (
    (v_order.status = 'pending' and p_status = 'printing')
    or (v_order.status = 'printing' and p_status = 'post_processing')
    or (v_order.status = 'post_processing' and p_status = 'delivered')
  ) then
    raise exception 'No se permite cambiar de % a %.', v_order.status, p_status;
  end if;

  if p_status = 'printing' and v_order.status = 'pending'
     and v_order.filament_grams_per_unit > 0 and v_order.filament_roll_id is null then
    raise exception 'Asigna una bobina de filamento antes de iniciar este pedido.';
  end if;

  if p_status = 'printing' and v_order.status = 'pending' and v_order.filament_roll_id is not null then
    v_required := v_order.filament_grams_per_unit * v_order.quantity;
    if v_required <= 0 then raise exception 'El pedido tiene una bobina, pero no tiene gramos definidos.'; end if;
    select * into v_roll from public.filament_rolls
    where id = v_order.filament_roll_id and user_id = auth.uid()
    for update;
    if not found then raise exception 'No se encontró la bobina de filamento del pedido.'; end if;
    if v_roll.remaining_weight_g < v_required then
      raise exception 'Filamento insuficiente: se requieren % g y quedan % g.', v_required, v_roll.remaining_weight_g;
    end if;
    update public.filament_rolls
    set remaining_weight_g = remaining_weight_g - v_required,
        status = case when remaining_weight_g - v_required = 0 then 'depleted' else 'active' end
    where id = v_roll.id and user_id = auth.uid();
    insert into public.inventory_movements (
      user_id, filament_roll_id, movement_type, quantity, unit, notes
    ) values (
      auth.uid(), v_roll.id, 'consumption', -v_required, 'g',
      'Consumo automático del pedido ' || v_order.id::text
    );
  end if;

  update public.orders set status = p_status where id = p_order_id and user_id = auth.uid();
end;
$$;

create or replace function public.record_order_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_refund_method text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
  v_refunded numeric;
  v_refund_id uuid;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor de la devolución debe ser mayor que cero.'; end if;
  if p_refund_method is null or p_refund_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Método de devolución inválido.';
  end if;

  select * into v_payment
  from public.order_payments
  where id = p_payment_id and user_id = v_user_id;
  if not found then raise exception 'No se encontró el pago para este usuario.'; end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id and user_id = v_user_id
  for update;
  if not found then raise exception 'No se encontró el pedido para este usuario.'; end if;
  if v_order.status = 'cancelled' then raise exception 'El pedido ya está cancelado.'; end if;
  if v_order.status = 'delivered' then
    raise exception 'Para devolver pagos de pedidos entregados se requiere primero el flujo de devoluciones de producto.';
  end if;

  select coalesce(sum(amount), 0) into v_refunded
  from public.order_refunds
  where payment_id = p_payment_id and user_id = v_user_id;
  if round(p_amount, 2) > round(v_payment.amount - v_refunded, 2) then
    raise exception 'La devolución supera el saldo disponible de este pago: %.',
      greatest(round(v_payment.amount - v_refunded, 2), 0);
  end if;

  insert into public.order_refunds (
    user_id, order_id, payment_id, amount, refund_method, notes
  ) values (
    v_user_id, v_order.id, v_payment.id, p_amount, p_refund_method,
    nullif(trim(p_notes), '')
  ) returning id into v_refund_id;
  return v_refund_id;
end;
$$;

create or replace function public.record_delivered_product_return(
  p_order_id uuid,
  p_quantity integer,
  p_item_condition text,
  p_payment_id uuid default null,
  p_refund_amount numeric default 0,
  p_refund_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_already_returned integer;
  v_refunded_from_payment numeric;
  v_returned_refunds numeric;
  v_max_refund numeric;
  v_return_id uuid;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad devuelta debe ser mayor que cero.'; end if;
  if p_item_condition is null or p_item_condition not in ('resalable', 'repair', 'scrap') then
    raise exception 'El estado del producto devuelto no es válido.';
  end if;
  if p_refund_amount is null or p_refund_amount < 0 then
    raise exception 'El importe del reembolso no puede ser negativo.';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'La nota no puede superar 500 caracteres.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_user_id
  for update;
  if not found then raise exception 'No se encontró el pedido para este usuario.'; end if;
  if v_order.status <> 'delivered' then
    raise exception 'Solo se pueden registrar devoluciones de pedidos entregados.';
  end if;

  select coalesce(sum(quantity), 0) into v_already_returned
  from public.order_product_returns
  where order_id = p_order_id and user_id = v_user_id;
  if v_already_returned + p_quantity > v_order.quantity then
    raise exception 'La cantidad devuelta supera las % unidades del pedido.', v_order.quantity;
  end if;

  if p_refund_amount > 0 then
    if p_payment_id is null then
      raise exception 'Selecciona el abono desde el que se realizará el reembolso.';
    end if;
    if p_refund_method is null or p_refund_method not in ('cash', 'transfer', 'card', 'other') then
      raise exception 'Método de reembolso inválido.';
    end if;

    select * into v_payment
    from public.order_payments
    where id = p_payment_id and order_id = p_order_id and user_id = v_user_id
    for update;
    if not found then raise exception 'El abono no pertenece a este pedido.'; end if;

    select coalesce(sum(amount), 0) into v_refunded_from_payment
    from public.order_refunds
    where payment_id = p_payment_id and user_id = v_user_id;
    if round(p_refund_amount, 2) > round(v_payment.amount - v_refunded_from_payment, 2) then
      raise exception 'El reembolso supera el saldo disponible del abono: %.',
        greatest(round(v_payment.amount - v_refunded_from_payment, 2), 0);
    end if;

    select coalesce(sum(amount), 0) into v_returned_refunds
    from public.order_refunds
    where order_id = p_order_id and user_id = v_user_id
      and product_return_id is not null;
    v_max_refund := round(
      v_order.sale_price * (v_already_returned + p_quantity)::numeric
        / v_order.quantity,
      2
    );
    if round(v_returned_refunds + p_refund_amount, 2) > v_max_refund then
      raise exception 'El reembolso supera el valor proporcional de las unidades devueltas (%).', v_max_refund;
    end if;
  elsif p_payment_id is not null or p_refund_method is not null then
    raise exception 'Para registrar una devolución sin reembolso, deja vacíos el abono y el método de reembolso.';
  end if;

  insert into public.order_product_returns (
    user_id, order_id, quantity, item_condition, notes
  ) values (
    v_user_id, p_order_id, p_quantity, p_item_condition, nullif(trim(p_notes), '')
  ) returning id into v_return_id;

  if p_refund_amount > 0 then
    insert into public.order_refunds (
      user_id, order_id, payment_id, product_return_id, amount, refund_method, notes
    ) values (
      v_user_id, p_order_id, p_payment_id, v_return_id, p_refund_amount,
      p_refund_method, nullif(trim(p_notes), '')
    );
  end if;

  return v_return_id;
end;
$$;

drop function if exists public.cancel_work_order(uuid, text);
create or replace function public.cancel_work_order(
  p_order_id uuid,
  p_reason text,
  p_recovered_filament_g numeric default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_roll public.filament_rolls%rowtype;
  v_paid numeric;
  v_refunded numeric;
  v_required numeric;
  v_recovered numeric := coalesce(p_recovered_filament_g, 0);
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if v_recovered < 0 then raise exception 'Los gramos recuperados no pueden ser negativos.'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_user_id
  for update;
  if not found then raise exception 'No se encontró el pedido para este usuario.'; end if;
  if v_order.status not in ('pending', 'printing', 'post_processing') then
    raise exception 'Solo se pueden cancelar pedidos pendientes o en producción; los entregados requieren un proceso de devolución.';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'El motivo de cancelación no puede superar 500 caracteres.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.order_payments
  where order_id = p_order_id and user_id = v_user_id;
  select coalesce(sum(amount), 0) into v_refunded
  from public.order_refunds
  where order_id = p_order_id and user_id = v_user_id;
  if round(v_refunded, 2) < round(v_paid, 2) then
    raise exception 'Registra la devolución de todos los pagos antes de cancelar este pedido. Pendiente de devolver: %.',
      greatest(round(v_paid - v_refunded, 2), 0);
  end if;

  if v_order.status in ('printing', 'post_processing')
     and v_order.filament_roll_id is not null
     and v_order.filament_grams_per_unit > 0 then
    v_required := v_order.filament_grams_per_unit * v_order.quantity;
    if v_recovered > v_required then
      raise exception 'Los gramos recuperados no pueden superar los % g consumidos por el pedido.', v_required;
    end if;
    select * into v_roll
    from public.filament_rolls
    where id = v_order.filament_roll_id and user_id = v_user_id
    for update;
    if not found then raise exception 'No se encontró la bobina asignada al pedido.'; end if;
    if v_roll.remaining_weight_g + v_recovered > v_roll.initial_weight_g then
      raise exception 'No se puede devolver el filamento: el saldo actual más el material del pedido supera el peso inicial de la bobina.';
    end if;

    if v_recovered > 0 then
      update public.filament_rolls
      set remaining_weight_g = remaining_weight_g + v_recovered,
          status = 'active'
      where id = v_roll.id and user_id = v_user_id;
      insert into public.inventory_movements (
        user_id, filament_roll_id, movement_type, quantity, unit, notes
      ) values (
        v_user_id, v_roll.id, 'adjustment', v_recovered, 'g',
        'Filamento recuperado al cancelar el pedido ' || v_order.id::text
          || case when nullif(trim(p_reason), '') is null then ''
                  else '. Motivo: ' || trim(p_reason) end
      );
    end if;
  elsif v_recovered > 0 then
    raise exception 'No hay filamento consumido asociado a este pedido para recuperar.';
  end if;

  update public.orders
  set status = 'cancelled',
      notes = concat_ws(E'\n', nullif(notes, ''), 'Cancelado: ' || coalesce(nullif(trim(p_reason), ''), 'sin motivo indicado'))
  where id = p_order_id and user_id = v_user_id;
end;
$$;

create or replace function public.cancel_pending_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cancel_work_order(p_order_id, null, 0);
end;
$$;

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_paid numeric;
  v_payment_id uuid;
begin
  if v_user_id is null then raise exception 'Se requiere una sesión autenticada.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor del abono debe ser mayor que cero.'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Método de pago inválido.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and user_id = v_user_id
  for update;
  if not found then raise exception 'No se encontró el pedido para este usuario.'; end if;
  if v_order.status = 'cancelled' then raise exception 'No se pueden registrar pagos para pedidos cancelados.'; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.order_payments
  where order_id = p_order_id and user_id = v_user_id;
  select v_paid - coalesce(sum(amount), 0) into v_paid
  from public.order_refunds
  where order_id = p_order_id and user_id = v_user_id;
  if round(p_amount, 2) > round(v_order.sale_price - v_paid, 2) then
    raise exception 'El abono supera el saldo pendiente de %.', greatest(round(v_order.sale_price - v_paid, 2), 0);
  end if;

  insert into public.order_payments (user_id, order_id, amount, payment_method, notes)
  values (v_user_id, p_order_id, p_amount, p_payment_method, nullif(trim(p_notes), ''))
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, uuid, text, numeric, numeric, numeric, text, text) from public;
revoke all on function public.create_filament_roll(text, text, text, numeric, numeric, uuid, numeric, numeric, text) from public;
revoke all on function public.update_filament_roll(uuid, text, text, text, numeric, uuid) from public;
revoke all on function public.create_hardware_item(text, text, numeric, text, numeric, numeric, uuid, text, numeric, numeric, text) from public;
revoke all on function public.update_hardware_item(uuid, text, text, numeric, numeric, uuid, text) from public;
revoke all on function public.transition_order_status(uuid, text) from public;
revoke all on function public.cancel_pending_order(uuid) from public;
revoke all on function public.cancel_work_order(uuid, text, numeric) from public;
revoke all on function public.record_order_payment(uuid, numeric, text, text) from public;
revoke all on function public.record_order_refund(uuid, numeric, text, text) from public;
revoke all on function public.record_delivered_product_return(uuid, integer, text, uuid, numeric, text, text) from public;
grant execute on function public.record_inventory_movement(uuid, uuid, text, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function public.create_filament_roll(text, text, text, numeric, numeric, uuid, numeric, numeric, text) to authenticated;
grant execute on function public.update_filament_roll(uuid, text, text, text, numeric, uuid) to authenticated;
grant execute on function public.create_hardware_item(text, text, numeric, text, numeric, numeric, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.update_hardware_item(uuid, text, text, numeric, numeric, uuid, text) to authenticated;
grant execute on function public.transition_order_status(uuid, text) to authenticated;
grant execute on function public.cancel_pending_order(uuid) to authenticated;
grant execute on function public.cancel_work_order(uuid, text, numeric) to authenticated;
grant execute on function public.record_order_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.record_order_refund(uuid, numeric, text, text) to authenticated;
grant execute on function public.record_delivered_product_return(uuid, integer, text, uuid, numeric, text, text) to authenticated;

revoke insert, update on public.filament_rolls from authenticated;
revoke insert, update on public.hardware_items from authenticated;
revoke insert, update, delete on public.inventory_movements from authenticated;
revoke update on public.orders from authenticated;
