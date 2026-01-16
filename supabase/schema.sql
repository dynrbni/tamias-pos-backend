-- Tamias POS Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Stores table
create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  owner_id uuid references auth.users on delete cascade,
  created_at timestamptz default now()
);

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text default 'cashier' check (role in ('owner', 'admin', 'cashier')),
  store_id uuid references public.stores on delete set null,
  created_at timestamptz default now()
);

-- Products table
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  name text not null,
  price integer not null check (price >= 0),
  category text,
  stock integer default 0 check (stock >= 0),
  barcode text,
  image_url text,
  created_at timestamptz default now()
);

-- Transactions table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores on delete cascade not null,
  cashier_id uuid references auth.users on delete set null,
  total integer not null check (total >= 0),
  tax integer default 0 check (tax >= 0),
  payment_method text check (payment_method in ('cash', 'card', 'qris')),
  items jsonb not null,
  created_at timestamptz default now()
);

-- Indexes for better query performance
create index if not exists idx_products_store_id on public.products(store_id);
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_transactions_store_id on public.transactions(store_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at);

-- Function to decrement stock
create or replace function decrement_stock(product_id uuid, qty integer)
returns void as $$
begin
  update public.products
  set stock = stock - qty
  where id = product_id and stock >= qty;
end;
$$ language plpgsql;

-- Row Level Security (RLS) Policies

-- Enable RLS
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;

-- Stores policies
create policy "Users can view their own stores" on public.stores
  for select using (owner_id = auth.uid() or id in (
    select store_id from public.profiles where id = auth.uid()
  ));

create policy "Owners can insert stores" on public.stores
  for insert with check (owner_id = auth.uid());

create policy "Owners can update their stores" on public.stores
  for update using (owner_id = auth.uid());

-- Profiles policies
create policy "Users can view own profile" on public.profiles
  for select using (id = auth.uid());

create policy "Users can update own profile" on public.profiles
  for update using (id = auth.uid());

-- Products policies
create policy "Users can view products in their store" on public.products
  for select using (store_id in (
    select store_id from public.profiles where id = auth.uid()
  ) or store_id in (
    select id from public.stores where owner_id = auth.uid()
  ));

create policy "Admins can manage products" on public.products
  for all using (store_id in (
    select store_id from public.profiles where id = auth.uid() and role in ('owner', 'admin')
  ) or store_id in (
    select id from public.stores where owner_id = auth.uid()
  ));

-- Transactions policies
create policy "Users can view transactions in their store" on public.transactions
  for select using (store_id in (
    select store_id from public.profiles where id = auth.uid()
  ) or store_id in (
    select id from public.stores where owner_id = auth.uid()
  ));

create policy "Cashiers can create transactions" on public.transactions
  for insert with check (store_id in (
    select store_id from public.profiles where id = auth.uid()
  ) or store_id in (
    select id from public.stores where owner_id = auth.uid()
  ));

-- Trigger to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
