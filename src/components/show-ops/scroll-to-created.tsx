"use client";

import { useEffect } from "react";

export function ScrollToCreated({ id }: { id?: string }) {
  useEffect(() => {
    if (!id) return;
    document.getElementById(`created-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id]);
  return null;
}

export function ScrollIntoView({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [id]);
  return null;
}
