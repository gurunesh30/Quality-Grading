import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGradeSession } from "@/hooks/use-grade-session";
import { mockGrade } from "@/api/mock";
import type { GradeRecord } from "@/types/api";

const record = (id: string): GradeRecord => ({
  ...mockGrade("apple"),
  id,
  thumbnail_url: null,
});

describe("useGradeSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => useGradeSession());
    expect(result.current.records).toEqual([]);
    expect(result.current.latest).toBeNull();
    expect(result.current.averageConfidence).toBeNull();
  });

  it("prepends new records so the newest is first", () => {
    const { result } = renderHook(() => useGradeSession());
    act(() => result.current.add(record("a")));
    act(() => result.current.add(record("b")));
    expect(result.current.records.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.current.latest?.id).toBe("b");
  });

  it("removes a single record and clears them all", () => {
    const { result } = renderHook(() => useGradeSession());
    act(() => result.current.add(record("a")));
    act(() => result.current.add(record("b")));
    act(() => result.current.remove("a"));
    expect(result.current.records.map((r) => r.id)).toEqual(["b"]);
    act(() => result.current.clear());
    expect(result.current.records).toEqual([]);
  });

  it("averages confidence across the session", () => {
    const { result } = renderHook(() => useGradeSession());
    act(() => result.current.add({ ...record("a"), confidence: 80 }));
    act(() => result.current.add({ ...record("b"), confidence: 60 }));
    expect(result.current.averageConfidence).toBeCloseTo(70);
  });

  it("caps history so a long session cannot grow without bound", () => {
    const { result } = renderHook(() => useGradeSession());
    for (let i = 0; i < 60; i += 1) {
      act(() => result.current.add(record(`r${i}`)));
    }
    expect(result.current.records).toHaveLength(50);
  });

  it("revokes thumbnail object URLs when a record is dropped", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { result } = renderHook(() => useGradeSession());
    act(() =>
      result.current.add({ ...record("a"), thumbnail_url: "blob:fake" }),
    );
    act(() => result.current.remove("a"));
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    revoke.mockRestore();
  });

  it("survives corrupted session storage", () => {
    sessionStorage.setItem("agrigrade.session.v1", "{not json");
    const { result } = renderHook(() => useGradeSession());
    expect(result.current.records).toEqual([]);
  });
});
