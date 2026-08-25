-- MHT Show Ops: 2% Connect application fee; guest checkout gross-up is a config flag.
update public.businesses
set platform_fee_bps = 200,
    show_ops_config = coalesce(show_ops_config, '{}'::jsonb)
      || jsonb_build_object('pass_platform_fee_to_guest', true),
    updated_at = now()
where name = 'MHT Show Ops';
