import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Spanish front door: sign in on Show Ops' own address, Solvio Connect in Spanish elsewhere (see ../page.tsx). */
export default async function SpanishHomePage() {
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("mht.")) redirect("/login");
  redirect("https://connect.solviosystems.com/es");
}
