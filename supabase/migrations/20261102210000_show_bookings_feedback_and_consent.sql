-- After-show feedback (template 4) and WhatsApp marketing consent (template 5).
alter table public.show_bookings
  -- When the after-show feedback WhatsApp went out, so it's sent once.
  add column if not exists feedback_sent_at timestamptz,
  -- When the marketing-permission question was sent to this guest.
  add column if not exists marketing_asked_at timestamptz,
  -- Consent: when and how the guest said yes (e.g. 'whatsapp_reply_yes').
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text check (marketing_opt_in_source is null or char_length(marketing_opt_in_source) <= 60),
  -- Guest replied STOP: no more feedback or marketing WhatsApps.
  add column if not exists whatsapp_opted_out_at timestamptz;
