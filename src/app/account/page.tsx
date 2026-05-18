import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Account · Solvio",
};

/** Legacy route — workspace settings live under the dashboard shell. */
export default function AccountRedirectPage() {
  redirect("/dashboard/settings");
}
