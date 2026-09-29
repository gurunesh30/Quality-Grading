import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type Transport } from "@/api/client";
import { mockEnvelopes, mockGrade } from "@/api/mock";

const transportReturning = (payload: unknown): Transport => ({
  request: vi.fn().mockResolvedValue(payload),
});

const image = new Blob(["x"], { type: "image/jpeg" });

describe("api client envelopes", () => {
  it("unwraps the versioned envelope", async () => {
    const client = createApiClient(transportReturning(mockEnvelopes.health));
    await expect(client.health()).resolves.toEqual(mockEnvelopes.health.data);
  });

  it("rejects a payload with no envelope", async () => {
    const client = createApiClient(transportReturning({ status: "ok" }));
    await expect(client.health()).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a payload that breaks the contract", async () => {
    const client = createApiClient(
      transportReturning({ schema_version: "1.0", data: { nope: true } }),
    );
    await expect(client.health()).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a grade that is not on the ladder", async () => {
    const bad = { ...mockGrade("apple"), grade: "Grade Z" };
    const client = createApiClient(
      transportReturning({ schema_version: "1.0", data: bad }),
    );
    await expect(client.grade({ image })).rejects.toBeInstanceOf(ApiError);
  });

  it("tolerates unknown extra fields so the client can lag a merge", async () => {
    const future = { ...mockGrade("apple"), added_later: { nested: 1 } };
    const client = createApiClient(
      transportReturning({ schema_version: "2.0", data: future }),
    );
    const result = await client.grade({ image });
    expect(result.id).toBe(future.id);
    expect(result).toHaveProperty("added_later");
  });
});

describe("api client request shaping", () => {
  it("sends calibration fields only when supplied", async () => {
    const request = vi.fn().mockResolvedValue({
      schema_version: "1.0",
      data: mockGrade("apple"),
    });
    const client = createApiClient({ request });

    await client.grade({ image });
    const bare = request.mock.calls[0][1]?.body as FormData;
    expect(bare.get("reference_diameter_mm")).toBeNull();
    expect(bare.get("produce_class_hint")).toBeNull();

    await client.grade({
      image,
      referenceDiameterMm: 24.26,
      referenceDiameterPx: 100,
      produceClassHint: "kiwi",
    });
    const full = request.mock.calls[1][1]?.body as FormData;
    expect(full.get("reference_diameter_mm")).toBe("24.26");
    expect(full.get("reference_diameter_px")).toBe("100");
    expect(full.get("produce_class_hint")).toBe("kiwi");
  });

  it("posts to the documented v1 paths", async () => {
    const request = vi.fn().mockResolvedValue(mockEnvelopes.health);
    const client = createApiClient({ request });
    await client.health();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("/api/v1/health");
  });
});
