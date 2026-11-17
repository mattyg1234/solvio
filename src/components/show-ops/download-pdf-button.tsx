"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { SHOW_OPS_GHOST_BTN } from "@/components/show-ops/show-ops-page-header";

/** A4 portrait in PDF points. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 24;

/** Elements whose bottom edge is a tidy place to start a new page. */
const BREAK_SELECTOR = "section, header, table, tr, li, .rounded-2xl, .rounded-xl, h2, h3, p";

function safeFileName(name: string): string {
  const base = name.replace(/[^\w\- .]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 120);
  return `${base || "report"}.pdf`;
}

function hiddenForPrint(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  const cls = node.getAttribute("class") || "";
  return /(^|\s)print:hidden(\s|$)/.test(cls) || node.hasAttribute("data-pdf-skip");
}

/**
 * Pick page breaks (in CSS px from the top of the captured element) so a page
 * ends at the bottom of a card / table row where possible, not through text.
 */
function pageBreaks(root: HTMLElement, pageHeightPx: number): number[] {
  const top = root.getBoundingClientRect().top;
  const total = root.scrollHeight;
  const bottoms = new Set<number>();
  root.querySelectorAll(BREAK_SELECTOR).forEach((el) => {
    if (el.closest("[class*='print:hidden'],[data-pdf-skip]")) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottoms.add(Math.ceil(r.bottom - top));
  });
  const sorted = [...bottoms].filter((b) => b > 0 && b < total).sort((a, b) => a - b);

  const starts = [0];
  let start = 0;
  while (total - start > pageHeightPx) {
    const limit = start + pageHeightPx;
    const minUseful = start + pageHeightPx * 0.45;
    let cut = limit;
    for (const b of sorted) {
      if (b > limit) break;
      if (b >= minUseful) cut = b + 4;
    }
    cut = Math.min(cut, limit);
    starts.push(cut);
    start = cut;
  }
  return starts;
}

/**
 * Downloads the element with id `targetId` as a real .pdf file (A4, split into
 * pages) instead of opening the browser's print dialog. Anything marked
 * `print:hidden` (buttons, filters) is left out, like it would be on paper.
 */
export function DownloadPdfButton({
  targetId,
  fileName,
  label = "Download PDF",
}: {
  targetId: string;
  fileName: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    const root = document.getElementById(targetId);
    if (!root) return;
    setBusy(true);
    setError(null);
    try {
      const [{ toCanvas }, { PDFDocument }] = await Promise.all([import("html-to-image"), import("pdf-lib")]);

      const widthPx = root.scrollWidth;
      const contentW = PAGE_W - MARGIN * 2;
      const contentH = PAGE_H - MARGIN * 2;
      // CSS px that fit on one page once the width is scaled to the page.
      const pageHeightPx = Math.floor((contentH / contentW) * widthPx);
      const starts = pageBreaks(root, pageHeightPx);

      const scale = 2;
      const canvas = await toCanvas(root, {
        pixelRatio: scale,
        backgroundColor: "#ffffff",
        cacheBust: true,
        width: widthPx,
        height: root.scrollHeight,
        filter: (node) => !hiddenForPrint(node),
      });

      const pdf = await PDFDocument.create();
      pdf.setTitle(fileName);
      pdf.setCreator("MHT Hub");
      const totalPx = root.scrollHeight;

      for (let i = 0; i < starts.length; i++) {
        const fromPx = starts[i];
        const toPx = i + 1 < starts.length ? starts[i + 1] : totalPx;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.max(1, Math.round((toPx - fromPx) * scale));
        const ctx = slice.getContext("2d");
        if (!ctx) throw new Error("Your browser could not draw the page.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, Math.round(fromPx * scale), canvas.width, slice.height, 0, 0, slice.width, slice.height);

        const jpg = await pdf.embedJpg(slice.toDataURL("image/jpeg", 0.92));
        const drawH = (slice.height / slice.width) * contentW;
        const page = pdf.addPage([PAGE_W, PAGE_H]);
        page.drawImage(jpg, { x: MARGIN, y: PAGE_H - MARGIN - drawH, width: contentW, height: drawH });
      }

      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeFileName(fileName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={download} disabled={busy} className={SHOW_OPS_GHOST_BTN}>
        <FileDown className="mr-2 h-4 w-4" aria-hidden />
        {busy ? "Making PDF…" : label}
      </button>
      {error ? <span className="mt-1 text-xs text-rose-700">PDF failed: {error}</span> : null}
    </span>
  );
}
