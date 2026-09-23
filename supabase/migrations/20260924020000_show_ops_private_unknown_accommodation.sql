-- "Unknown" joins the private-accommodation choices (Staying at: Airbnb / Hotel / Villa /
-- Friends & family / Unknown). Accommodation is now recorded whenever the guest is not
-- at a listed hotel, whatever the transport choice.
alter table public.show_bookings drop constraint if exists show_bookings_private_accommodation_check;
alter table public.show_bookings
  add constraint show_bookings_private_accommodation_check
  check (
    private_accommodation is null
    or private_accommodation in ('hotel', 'villa', 'airbnb', 'friends_family', 'unknown')
  );
