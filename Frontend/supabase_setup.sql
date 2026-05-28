-- =====================================================
-- RETIX PLATFORM — Full Database Setup
-- Run this entirely in Supabase SQL Editor
-- =====================================================

-- 1. PROFILES (already created, skip if exists)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  distributor   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit          TEXT DEFAULT 'units',
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Transit','Delivered','Cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  sku           TEXT,
  category      TEXT,
  quantity      INTEGER NOT NULL DEFAULT 0,
  unit          TEXT DEFAULT 'units',
  reorder_level INTEGER DEFAULT 10,
  buying_price  NUMERIC(12,2) DEFAULT 0,
  selling_price NUMERIC(12,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DISTRIBUTORS
CREATE TABLE IF NOT EXISTS public.distributors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  location    TEXT,
  territory   TEXT,
  balance     NUMERIC(12,2) DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. KHATA LEDGER
CREATE TABLE IF NOT EXISTS public.khata (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  party_name  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('Credit','Debit')),
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  entry_date  DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY (each user sees only their data)
-- =====================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata       ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- ORDERS
DROP POLICY IF EXISTS "orders_all" ON public.orders;
CREATE POLICY "orders_all" ON public.orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INVENTORY
DROP POLICY IF EXISTS "inventory_all" ON public.inventory;
CREATE POLICY "inventory_all" ON public.inventory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DISTRIBUTORS
DROP POLICY IF EXISTS "distributors_all" ON public.distributors;
CREATE POLICY "distributors_all" ON public.distributors FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- KHATA
DROP POLICY IF EXISTS "khata_all" ON public.khata;
CREATE POLICY "khata_all" ON public.khata FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- Done! Your database is fully set up.
-- =====================================================