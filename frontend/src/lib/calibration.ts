/**
 * Physical size calibration (README section 3C).
 *
 * Kept free of React so the arithmetic can be tested on its own and reused by
 * any view that needs a millimetre-per-pixel ratio.
 */

export interface CalibrationValues {
  referenceDiameterMm: number;
  referenceDiameterPx: number;
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * `scale = known reference diameter (mm) / measured reference diameter (px)`.
 *
 * Returns `null` when either side is missing or non-positive, so callers can
 * omit calibration from the request rather than send a bogus scale.
 */
export function scaleMmPerPixel(
  values: CalibrationValues,
): number | null {
  const { referenceDiameterMm, referenceDiameterPx } = values;
  if (!isPositive(referenceDiameterMm) || !isPositive(referenceDiameterPx)) {
    return null;
  }
  return referenceDiameterMm / referenceDiameterPx;
}

/**
 * True surface area in cm² from a pixel count.
 *
 * `area = px * scale² * 10⁻²` — the `10⁻²` converts mm² to cm².
 */
export function trueAreaCm2(pixelArea: number, scale: number): number | null {
  if (!isPositive(pixelArea) || !isPositive(scale)) return null;
  return pixelArea * scale * scale * 1e-2;
}
