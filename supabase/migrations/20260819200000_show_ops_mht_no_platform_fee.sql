-- MHT Show Ops: no Solvio take-rate on guest pay-links (SaaS only).
update public.businesses
set platform_fee_bps = 0,
    show_ops_config = coalesce(show_ops_config, '{}'::jsonb)
      - 'pass_platform_fee_to_guest',
    updated_at = now()
where name = 'MHT Show Ops';
