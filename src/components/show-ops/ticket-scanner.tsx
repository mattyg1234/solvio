"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { checkInShowOpsTicketAction, type TicketScanResult } from "@/app/dashboard/show-ops/actions";
import { parseTicketTokenFromScan } from "@/lib/show-ops/ticket-token";
import { cn } from "@/lib/utils";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type Props = {
  variant?: "compact" | "door";
  onCheckedIn?: (result: TicketScanResult) => void;
};

export function TicketScanner({ variant = "compact", onCheckedIn }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<TicketScanResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastScan = useRef("");
  const door = variant === "door";
  const onCheckedInRef = useRef(onCheckedIn);
  onCheckedInRef.current = onCheckedIn;

  function submitScan(raw: string) {
    const fd = new FormData();
    fd.set("scan", raw);
    start(async () => {
      const res = await checkInShowOpsTicketAction(fd);
      setResult(res);
      if (res.ok) {
        onCheckedInRef.current?.(res);
        router.refresh();
      }
    });
  }
  const submitScanRef = useRef(submitScan);
  submitScanRef.current = submitScan;

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;

    async function run() {
      setCamError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setCamError("Camera blocked — paste the ticket link or allow camera access.");
        return;
      }
      if (!video || stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
        .BarcodeDetector;
      if (!Detector) {
        setCamError("This browser can’t scan QR in-page. Open this desk in Chrome or Safari, or paste the ticket link.");
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (stopped || !video || video.readyState < 2) {
          timer = window.setTimeout(tick, 250);
          return;
        }
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue?.trim() ?? "";
          if (raw && raw !== lastScan.current && parseTicketTokenFromScan(raw)) {
            lastScan.current = raw;
            submitScanRef.current(raw);
          }
        } catch {
          /* keep looping */
        }
        timer = window.setTimeout(tick, 350);
      };
      timer = window.setTimeout(tick, 400);
    }
    void run();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [open]);

  useEffect(() => {
    if (!result || !door) return;
    const t = window.setTimeout(() => setResult(null), 5000);
    return () => window.clearTimeout(t);
  }, [result, door]);

  return (
    <div
      className={cn(
        "print:hidden",
        door
          ? "sticky top-0 z-20 -mx-1 space-y-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
          : "rounded-2xl bg-white p-4 ring-1 ring-slate-200",
      )}
    >
      {door ? (
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setResult(null);
            lastScan.current = "";
          }}
          className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 text-xl font-semibold text-white shadow-lg shadow-slate-900/20 active:scale-[0.99]"
        >
          {open ? "Close camera" : "Scan ticket"}
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">Door scanner</p>
            <p className="text-xs text-slate-500">Scan the guest QR to file them in. Camera stays on this phone.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setResult(null);
              lastScan.current = "";
            }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {open ? "Close camera" : "Scan ticket"}
          </button>
        </div>
      )}
      {open ? (
        <div className={door ? "space-y-3" : "mt-3 space-y-3"}>
          <video
            ref={videoRef}
            className={cn("w-full rounded-xl bg-black object-cover", door ? "aspect-[3/4] max-h-[42vh]" : "aspect-[4/3]")}
            playsInline
            muted
          />
          {camError ? <p className="text-sm text-amber-800">{camError}</p> : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) submitScan(manual.trim());
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Or paste ticket link"
              className={cn(
                "min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-base",
                door ? "min-h-12" : "py-2 text-sm",
              )}
            />
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 font-semibold text-white disabled:opacity-50",
                door ? "min-h-12 px-4 text-base" : "py-2 text-sm",
              )}
            >
              File in
            </button>
          </form>
        </div>
      ) : null}
      {result ? (
        <p
          className={cn(
            "rounded-xl px-3 py-2 font-medium",
            door ? "text-base" : "mt-3 text-sm",
            !result.ok
              ? "bg-rose-50 text-rose-900"
              : result.alreadyIn
                ? "bg-amber-50 text-amber-950"
                : "bg-emerald-50 text-emerald-900",
          )}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

export function DoorTicketScanner({ date, island }: { date: string; island: string }) {
  const router = useRouter();
  return (
    <TicketScanner
      variant="door"
      onCheckedIn={(res) => {
        if (!res.showDate) return;
        const sameNight = res.showDate === date;
        const sameIsland = !island || !res.island || res.island === island;
        if (sameNight && sameIsland) return;
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
        params.set("date", res.showDate);
        if (island && res.island) params.set("island", res.island);
        router.push(`/dashboard/show-ops/door?${params.toString()}`);
      }}
    />
  );
}
