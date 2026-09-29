/**
 * Session-scoped grade history.
 *
 * The API is stateless, so history lives in `sessionStorage`: it survives a
 * reload without outliving the tab, and thumbnails are object URLs that are
 * revoked on removal so a long session does not leak blobs.
 */

import { useCallback, useEffect, useState } from "react";
import type { GradeRecord } from "@/types/api";

const STORAGE_KEY = "agrigrade.session.v1";

function read(): GradeRecord[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GradeRecord[];
  } catch {
    return [];
  }
}

function write(records: GradeRecord[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota exceeded, or storage disabled. History degrades to in-memory.
  }
}

export function useGradeSession() {
  const [records, setRecords] = useState<GradeRecord[]>(read);

  useEffect(() => {
    write(records);
  }, [records]);

  const add = useCallback((record: GradeRecord) => {
    setRecords((current) => [record, ...current].slice(0, 50));
  }, []);

  const remove = useCallback((id: string) => {
    setRecords((current) => {
      const target = current.find((record) => record.id === id);
      if (target?.thumbnail_url) URL.revokeObjectURL(target.thumbnail_url);
      return current.filter((record) => record.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setRecords((current) => {
      current.forEach((record) => {
        if (record.thumbnail_url) URL.revokeObjectURL(record.thumbnail_url);
      });
      return [];
    });
  }, []);

  const latest = records[0] ?? null;

  /** Mean confidence across the session, or null when empty. */
  const averageConfidence =
    records.length === 0
      ? null
      : records.reduce((sum, r) => sum + r.confidence, 0) / records.length;

  return { records, latest, averageConfidence, add, remove, clear };
}
