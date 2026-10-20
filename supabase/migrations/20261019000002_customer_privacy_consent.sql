alter table public.customers
  add column if not exists privacy_consent_status text not null default 'not_recorded',
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists privacy_consent_method text,
  add column if not exists privacy_notice_version text;

alter table public.customers
  drop constraint if exists customers_privacy_consent_status_check,
  add constraint customers_privacy_consent_status_check
    check (privacy_consent_status in ('not_recorded', 'granted')),
  drop constraint if exists customers_privacy_consent_method_check,
  add constraint customers_privacy_consent_method_check
    check (
      privacy_consent_method is null
      or privacy_consent_method in ('written', 'verbal', 'digital', 'other')
    ),
  drop constraint if exists customers_privacy_consent_record_check,
  add constraint customers_privacy_consent_record_check
    check (
      (
        privacy_consent_status = 'not_recorded'
        and privacy_consent_at is null
        and privacy_consent_method is null
        and privacy_notice_version is null
      )
      or (
        privacy_consent_status = 'granted'
        and privacy_consent_at is not null
        and privacy_consent_method is not null
        and privacy_notice_version is not null
      )
    );

create or replace function public.set_customer_consent_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.privacy_consent_status = 'granted'
     and tg_op = 'INSERT' then
    new.privacy_consent_at := now();
  elsif new.privacy_consent_status = 'granted'
     and (
       old.privacy_consent_status is distinct from 'granted'
       or new.privacy_consent_method is distinct from old.privacy_consent_method
       or new.privacy_notice_version is distinct from old.privacy_notice_version
     ) then
    new.privacy_consent_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists customers_set_consent_timestamp on public.customers;
create trigger customers_set_consent_timestamp
before insert or update on public.customers
for each row execute function public.set_customer_consent_timestamp();

drop policy if exists "Company members manage customers" on public.customers;
drop policy if exists "Company members read customers" on public.customers;
drop policy if exists "Company members create consented customers" on public.customers;
drop policy if exists "Company members update consented customers" on public.customers;
drop policy if exists "Company members delete customers" on public.customers;

create policy "Company members read customers" on public.customers
  for select to authenticated
  using (company_id = public.current_company_id());

create policy "Company members create consented customers" on public.customers
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and user_id = auth.uid()
    and privacy_consent_status = 'granted'
    and privacy_consent_at is not null
    and privacy_consent_method is not null
    and privacy_notice_version is not null
  );

create policy "Company members update consented customers" on public.customers
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (
    company_id = public.current_company_id()
    and privacy_consent_status = 'granted'
    and privacy_consent_at is not null
    and privacy_consent_method is not null
    and privacy_notice_version is not null
  );

create policy "Company members delete customers" on public.customers
  for delete to authenticated
  using (company_id = public.current_company_id());
