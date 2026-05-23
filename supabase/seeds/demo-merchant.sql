-- Demo merchant seed for sales demos
-- Run this in Supabase Dashboard → SQL Editor (as service role)
-- Creates a "The Anchor Bar" demo business reachable at /book/solvio-demo

-- STEP 1: Sign up a demo account at your Vercel URL with:
--   Business name: The Anchor Bar
--   Email: demo@yourdomain.com
--   (Then confirm the email, log in once to create the business row)

-- STEP 2: After signing up, run this SQL to set the booking slug and configure demo content.
-- Replace 'The Anchor Bar' below if you used a different business name.

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- Find the business by name
  SELECT id INTO biz_id
  FROM public.businesses
  WHERE name ILIKE '%anchor%' OR name ILIKE '%demo%'
  LIMIT 1;

  IF biz_id IS NULL THEN
    RAISE EXCEPTION 'Demo business not found — sign up first with business name "The Anchor Bar"';
  END IF;

  -- Set the booking slug, subscription tier, and booking capabilities
  UPDATE public.businesses
  SET
    booking_slug             = 'solvio-demo',
    subscription_tier        = 'pro',
    booking_flow_kind        = 'tables',
    booking_flow_completed_at = now(),
    platform_fee_bps         = 250
  WHERE id = biz_id;

  -- Add a few demo floor plan tables
  INSERT INTO public.floor_plan_tables (business_id, label, capacity, shape, fill_colour, position_x, position_y)
  SELECT biz_id, label, capacity, 'rectangle', '#ede9fe', pos_x, pos_y
  FROM (VALUES
    ('Table 1', 2, 100, 100),
    ('Table 2', 4, 280, 100),
    ('Table 3', 4, 460, 100),
    ('Table 4', 6, 100, 280),
    ('Table 5', 6, 340, 280),
    ('Bar seats', 8, 100, 460)
  ) AS t(label, capacity, pos_x, pos_y)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Demo merchant ready → /book/solvio-demo';
END;
$$;
