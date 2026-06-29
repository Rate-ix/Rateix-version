-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ixeausiogmzweppiytfy/sql

-- 1. Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text DEFAULT 'General',
  sku text,
  selling_price numeric(10,2) DEFAULT 0,
  cost_price numeric(10,2) DEFAULT 0,
  stock integer DEFAULT 0,
  min_stock integer DEFAULT 5,
  unit text DEFAULT 'pcs',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_inventory" ON public.inventory FOR ALL USING (auth.uid() = user_id);

-- 2. Invoices / Bills
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text DEFAULT 'Walk-in Customer',
  customer_phone text,
  subtotal numeric(10,2) DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  gst_amount numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_invoices" ON public.invoices FOR ALL USING (auth.uid() = user_id);

-- 3. Invoice Line Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity integer DEFAULT 1,
  selling_price numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0
);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_invoice_items" ON public.invoice_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_id AND invoices.user_id = auth.uid()
  ));

-- 4. Khatabook Customers
CREATE TABLE IF NOT EXISTS public.khata_customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  total_due numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.khata_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_khata" ON public.khata_customers FOR ALL USING (auth.uid() = user_id);

-- 5. Khatabook Entries (Udhari / Payment)
CREATE TABLE IF NOT EXISTS public.khata_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.khata_customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','debit')),
  amount numeric(10,2) NOT NULL,
  description text,
  entry_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.khata_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_khata_entries" ON public.khata_entries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.khata_customers
    WHERE khata_customers.id = customer_id AND khata_customers.user_id = auth.uid()
  ));
