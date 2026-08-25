export default async function ShowOpsPayCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Payment not completed</h1>
      <p className="mt-3 text-slate-600">
        No charge was taken{sp.ref ? ` for ${sp.ref}` : ""}. Ask the office to send the link again if you still need to
        pay.
      </p>
    </main>
  );
}
