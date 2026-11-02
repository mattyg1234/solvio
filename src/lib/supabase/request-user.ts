import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user, looked up once per request.
 *
 * `auth.getUser()` is a network round trip to Supabase Auth. The dashboard
 * layout, the Show Ops layout, its metadata and the page itself all need the
 * user, so without this every page view paid for the same lookup several times.
 */
export const getRequestUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
