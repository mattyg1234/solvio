import { redirect } from "next/navigation";

/** The Spanish front page is Solvio Connect's too (see ../page.tsx). */
export default function SpanishHomePage() {
  redirect("https://connect.solviosystems.com/es");
}
