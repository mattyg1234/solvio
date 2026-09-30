import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Show Ops lives at mht.solviosystems.com, for its operators only: its front door is the
 * sign in. solviosystems.com itself is Solvio Connect.
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A sign-in link that lands on the homepage still finishes signing in here.
  if (typeof params.code === "string") {
    redirect(`/auth/callback?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"))}`);
  }
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("mht.")) redirect("/login");
  redirect("https://connect.solviosystems.com");
}
