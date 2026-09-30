import { redirect } from "next/navigation";

/**
 * solviosystems.com's public front page is Solvio Connect's. Show Ops stays here, for its
 * operators only: /login, partner links, bookings, tickets and payments are unchanged.
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A sign-in link that lands on the homepage still finishes signing in here.
  if (typeof params.code === "string") {
    redirect(`/auth/callback?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"))}`);
  }
  redirect("https://connect.solviosystems.com");
}
