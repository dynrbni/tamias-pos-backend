-- Tamias POS Database Schema V2
-- Run this in Supabase SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- DROP TRIGGERS FIRST (before functions)
-- ============================================
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_transaction_created on public.transactions;

-- ============================================
-- DROP POLICIES THAT DEPEND ON FUNCTIONS
-- ============================================
drop policy if exists "Users can view products in their store" on public.products;
drop policy if exists "Users can manage products" on public.products;
drop policy if exists "Users can view transactions in their store" on public.transactions;
drop policy if exists "Users can create transactions" on public.transactions;
drop policy if exists "Users can manage customers" on public.customers;
drop policy if exists "Users can manage employees" on public.employees;
drop policy if exists "Users can manage categories" on public.categories;

-- ============================================
-- DROP EXISTING FUNCTIONS (to avoid conflicts)
-- ============================================
drop function if exists get_dashboard_stats(uuid);
drop function if exists get_sales_chart(uuid, integer);
drop function if exists get_top_products(uuid, integer);
drop function if exists get_user_store_id();
drop function if exists decrement_stock(uuid, integer);
drop function if exists update_customer_stats();
drop function if exists public.handle_new_user();

-- ============================================
-- CORE TABLES
-- ============================================

-- Stores table
create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  phone text,
  owner_id uuid references auth.users on delete cascade,
  created_at timestamptz default now()
);

-- Add missing columns to stores if they don't exist
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'stores' and column_name = 'phone') then
    alter table public.stores add column phone text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'stores' and column_name = 'description') then
    alter table public.stores add column description text;
  end if;
  -- NEW: Short 8-digit ID for Customer Display
  if not exists (select 1 from information_schema.columns where table_name = 'stores' and column_name = 'display_id') then
    alter table public.stores add column display_id text unique;
    
    -- Populate existing stores with random 8-digit IDs
    update public.stores 
    set display_id = floor(10000000 + random() * 90000000)::text
    where display_id is null;
  end if;
end $$;

-- Function to ensure display_id is generated on insert
create or replace function public.set_display_id()
returns trigger as $$
begin
  if new.display_id is null then
    -- Generate random 8-digit number
    new.display_id := floor(10000000 + random() * 90000000)::text;
    
    -- Ensure uniqueness (simple retry logic could be added but collision prob is low for this scale)
    while exists (select 1 from public.stores where display_id = new.display_id) loop
      new.display_id := floor(10000000 + random() * 90000000)::text;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger for display_id
drop trigger if exists on_store_created_set_id on public.stores;
create trigger on_store_created_set_id
  before insert on public.stores
  for each row execute procedure public.set_display_id();

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text default 'cashier' check (role in ('owner', 'admin', 'cashier')),
  store_id uuid references public.stores on delete set null,
  created_at timestamptz default now()
);

-- Add missing columns to profiles
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'email') then
    alter table public.profiles add column email text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'avatar_url') then
    alter table public.profiles add column avatar_url text;
  end if;
end $$;

-- Categories table
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  name text not null,
  color text default '#10B981',
  created_at timestamptz default now()
);

-- Products table
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  category_id uuid references public.categories on delete set null,
  name text not null,
  price integer not null check (price >= 0),
  cost integer default 0,
  category text,
  stock integer default 0,
  min_stock integer default 10,
  barcode text,
  image_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Add missing columns to products
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'category_id') then
    alter table public.products add column category_id uuid references public.categories on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'cost') then
    alter table public.products add column cost integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'min_stock') then
    alter table public.products add column min_stock integer default 10;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'is_active') then
    alter table public.products add column is_active boolean default true;
  end if;
end $$;

-- Customers table
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  name text not null,
  phone text,
  email text,
  address text,
  total_transactions integer default 0,
  total_spent integer default 0,
  created_at timestamptz default now()
);

-- Employees table
create table if not exists public.employees (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  user_id uuid references auth.users on delete set null,
  employee_id text unique, -- 10-digit unique ID for login
  name text not null,
  email text,
  phone text,
  role text default 'cashier',
  salary integer default 0,
  pin text, -- Password for login
  avatar_url text,
  is_active boolean default true,
  joined_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Add missing columns to employees
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'employee_id') then
    alter table public.employees add column employee_id text unique;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'pin') then
    alter table public.employees add column pin text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'avatar_url') then
    alter table public.employees add column avatar_url text;
  end if;
end $$;

-- Transactions table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  cashier_id uuid references auth.users on delete set null,
  customer_id uuid,
  subtotal integer default 0,
  tax integer default 0,
  discount integer default 0,
  total integer not null,
  payment_method text,
  payment_amount integer default 0,
  change_amount integer default 0,
  status text default 'completed',
  notes text,
  items jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Add missing columns to transactions
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'customer_id') then
    alter table public.transactions add column customer_id uuid;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'subtotal') then
    alter table public.transactions add column subtotal integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'discount') then
    alter table public.transactions add column discount integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'status') then
    alter table public.transactions add column status text default 'completed';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'payment_amount') then
    alter table public.transactions add column payment_amount integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'change_amount') then
    alter table public.transactions add column change_amount integer default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'notes') then
    alter table public.transactions add column notes text;
  end if;
end $$;

-- ============================================
-- INDEXES
-- ============================================

create index if not exists idx_products_store_id on public.products(store_id);
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_transactions_store_id on public.transactions(store_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at);
create index if not exists idx_customers_store_id on public.customers(store_id);
create index if not exists idx_employees_store_id on public.employees(store_id);
create index if not exists idx_categories_store_id on public.categories(store_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to decrement stock
create or replace function decrement_stock(product_id uuid, qty integer)
returns void as $$
begin
  update public.products
  set stock = stock - qty
  where id = product_id and stock >= qty;
end;
$$ language plpgsql;

-- Function to get dashboard stats
create or replace function get_dashboard_stats(p_store_id uuid)
returns json as $$
declare
  result json;
  today_start timestamptz := date_trunc('day', now());
  yesterday_start timestamptz := date_trunc('day', now() - interval '1 day');
begin
  select json_build_object(
    'today_sales', coalesce((
      select sum(total) from public.transactions 
      where store_id = p_store_id 
        and created_at >= today_start 
        and (status = 'completed' or status is null)
    ), 0),
    'yesterday_sales', coalesce((
      select sum(total) from public.transactions 
      where store_id = p_store_id 
        and created_at >= yesterday_start 
        and created_at < today_start 
        and (status = 'completed' or status is null)
    ), 0),
    'today_transactions', coalesce((
      select count(*) from public.transactions 
      where store_id = p_store_id 
        and created_at >= today_start 
        and (status = 'completed' or status is null)
    ), 0),
    'yesterday_transactions', coalesce((
      select count(*) from public.transactions 
      where store_id = p_store_id 
        and created_at >= yesterday_start 
        and created_at < today_start 
        and (status = 'completed' or status is null)
    ), 0),
    'today_items_sold', coalesce((
      select sum((item->>'quantity')::int) 
      from public.transactions t, jsonb_array_elements(t.items) as item
      where t.store_id = p_store_id 
        and t.created_at >= today_start 
        and (t.status = 'completed' or t.status is null)
    ), 0),
    'yesterday_items_sold', coalesce((
      select sum((item->>'quantity')::int) 
      from public.transactions t, jsonb_array_elements(t.items) as item
      where t.store_id = p_store_id 
        and t.created_at >= yesterday_start 
        and t.created_at < today_start 
        and (t.status = 'completed' or t.status is null)
    ), 0),
    'total_products', coalesce((
      select count(*) from public.products 
      where store_id = p_store_id 
        and (is_active = true or is_active is null)
    ), 0),
    'low_stock_count', coalesce((
      select count(*) from public.products 
      where store_id = p_store_id 
        and stock <= coalesce(min_stock, 10) 
        and (is_active = true or is_active is null)
    ), 0),
    'total_customers', coalesce((
      select count(*) from public.customers where store_id = p_store_id
    ), 0),
    'total_employees', coalesce((
      select count(*) from public.employees 
      where store_id = p_store_id 
        and (is_active = true or is_active is null)
    ), 0)
  ) into result;
  
  return result;
end;
$$ language plpgsql;

-- Function to get sales chart data (last 7 days)
create or replace function get_sales_chart(p_store_id uuid, p_days integer default 7)
returns json as $$
declare
  result json;
begin
  select json_agg(row_to_json(t)) into result
  from (
    select 
      to_char(d.date, 'YYYY-MM-DD') as date,
      to_char(d.date, 'Dy') as day_name,
      coalesce(sum(tx.total), 0) as total_sales,
      coalesce(count(tx.id), 0) as transaction_count
    from generate_series(
      date_trunc('day', now()) - ((p_days - 1) || ' days')::interval,
      date_trunc('day', now()),
      '1 day'::interval
    ) as d(date)
    left join public.transactions tx 
      on date_trunc('day', tx.created_at) = d.date 
      and tx.store_id = p_store_id 
      and (tx.status = 'completed' or tx.status is null)
    group by d.date
    order by d.date
  ) t;
  
  return coalesce(result, '[]'::json);
end;
$$ language plpgsql;

-- Function to get top selling products
create or replace function get_top_products(p_store_id uuid, p_limit integer default 5)
returns json as $$
declare
  result json;
begin
  select json_agg(row_to_json(t)) into result
  from (
    select 
      p.id,
      p.name,
      coalesce(sum((item->>'quantity')::int), 0) as sold,
      coalesce(sum((item->>'quantity')::int * (item->>'price')::int), 0) as revenue
    from public.products p
    left join public.transactions tx 
      on tx.store_id = p.store_id 
      and (tx.status = 'completed' or tx.status is null)
    left join lateral jsonb_array_elements(tx.items) as item 
      on (item->>'product_id')::uuid = p.id
    where p.store_id = p_store_id 
      and (p.is_active = true or p.is_active is null)
    group by p.id, p.name
    having coalesce(sum((item->>'quantity')::int), 0) > 0
    order by sold desc
    limit p_limit
  ) t;
  
  return coalesce(result, '[]'::json);
end;
$$ language plpgsql;

-- Helper function to get user's store_id
create or replace function get_user_store_id()
returns uuid as $$
  select coalesce(
    (select store_id from public.profiles where id = auth.uid()),
    (select id from public.stores where owner_id = auth.uid() limit 1)
  );
$$ language sql security definer;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.categories enable row level security;

-- Drop existing policies first
drop policy if exists "Users can view their own stores" on public.stores;
drop policy if exists "Owners can insert stores" on public.stores;
drop policy if exists "Owners can update their stores" on public.stores;
drop policy if exists "Owners can delete their stores" on public.stores;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view products in their store" on public.products;
drop policy if exists "Users can manage products" on public.products;
drop policy if exists "Users can view transactions in their store" on public.transactions;
drop policy if exists "Users can create transactions" on public.transactions;
drop policy if exists "Users can manage customers" on public.customers;
drop policy if exists "Users can manage employees" on public.employees;
drop policy if exists "Users can manage categories" on public.categories;

-- Stores policies
create policy "Users can view their own stores" on public.stores
  for select using (owner_id = auth.uid() or id in (
    select store_id from public.profiles where id = auth.uid()
  ));

create policy "Owners can insert stores" on public.stores
  for insert with check (owner_id = auth.uid());

create policy "Owners can update their stores" on public.stores
  for update using (owner_id = auth.uid());

create policy "Owners can delete their stores" on public.stores
  for delete using (owner_id = auth.uid());

-- Profiles policies
create policy "Users can view own profile" on public.profiles
  for select using (id = auth.uid());

create policy "Users can insert own profile" on public.profiles
  for insert with check (id = auth.uid());

create policy "Users can update own profile" on public.profiles
  for update using (id = auth.uid());

-- Products policies
-- Allow public access for mobile app (no Supabase auth)
drop policy if exists "Public can access products" on public.products;
create policy "Public can access products" on public.products
  for all using (true);

create policy "Users can view products in their store" on public.products
  for select using (store_id = get_user_store_id());

create policy "Users can manage products" on public.products
  for all using (store_id = get_user_store_id());

-- Transactions policies
drop policy if exists "Public can access transactions" on public.transactions;
create policy "Public can access transactions" on public.transactions
  for all using (true);

create policy "Users can view transactions in their store" on public.transactions
  for select using (store_id = get_user_store_id());

create policy "Users can create transactions" on public.transactions
  for insert with check (store_id = get_user_store_id());

-- Customers policies
drop policy if exists "Public can access customers" on public.customers;
create policy "Public can access customers" on public.customers
  for all using (true);

create policy "Users can manage customers" on public.customers
  for all using (store_id = get_user_store_id());

-- Employees policies
-- Allow public read for login (by employee_id)
drop policy if exists "Public can read employees for login" on public.employees;
create policy "Public can read employees for login" on public.employees
  for select using (true);

create policy "Users can manage employees" on public.employees
  for all using (store_id = get_user_store_id());

-- Categories policies
drop policy if exists "Public can access categories" on public.categories;
create policy "Public can access categories" on public.categories
  for all using (true);

create policy "Users can manage categories" on public.categories
  for all using (store_id = get_user_store_id());

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id, 
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger to update customer stats after transaction
create or replace function update_customer_stats()
returns trigger as $$
begin
  if new.customer_id is not null then
    update public.customers
    set 
      total_transactions = total_transactions + 1,
      total_spent = total_spent + new.total
    where id = new.customer_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_transaction_created on public.transactions;
create trigger on_transaction_created
  after insert on public.transactions
  for each row execute procedure update_customer_stats();

-- Grant execute permissions
grant execute on function get_dashboard_stats(uuid) to authenticated;
grant execute on function get_sales_chart(uuid, integer) to authenticated;
grant execute on function get_top_products(uuid, integer) to authenticated;
grant execute on function get_user_store_id() to authenticated;

-- ============================================
-- FIXES (Added by AI)
-- ============================================

-- Fix: Transactions should reference employees table, NOT auth.users
-- This allows cashier_id (employee.id) to be stored correctly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transactions_cashier_id_fkey') THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_cashier_id_fkey;
  END IF;
  
  ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_cashier_id_fkey 
  FOREIGN KEY (cashier_id) 
  REFERENCES public.employees(id) 
  ON DELETE SET NULL;
END $$;
