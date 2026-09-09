import { gygHandler, handleBook } from "@/lib/show-ops/gyg-data";

// GetYourGuide Supplier API: /1/book (the /1/ version segment is mandatory in their spec).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return gygHandler(req, (body, _url, db) => handleBook(body, db));
}
