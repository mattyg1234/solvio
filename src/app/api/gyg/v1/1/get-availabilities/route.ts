import { gygHandler, handleGetAvailabilities } from "@/lib/show-ops/gyg-data";

// GetYourGuide Supplier API: /1/get-availabilities (the /1/ version segment is mandatory in their spec).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return gygHandler(req, (_body, url, db) => handleGetAvailabilities(url, db));
}
