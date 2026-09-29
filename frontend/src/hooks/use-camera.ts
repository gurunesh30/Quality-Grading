/**
 * `getUserMedia` lifecycle for the capture view.
 *
 * Frames stay in the browser: the stream is attached to a `<video>` element
 * the caller owns, and `capture()` paints one still to an offscreen canvas.
 * Nothing is uploaded until the user submits.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "unavailable"
  | "error";

export interface UseCameraOptions {
  facingMode?: "environment" | "user";
  width?: number;
  height?: number;
}

export function useCamera({
  facingMode = "environment",
  width = 1280,
  height = 720,
}: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setError("This browser exposes no camera API. Upload a frame instead.");
      return;
    }

    setStatus("requesting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: width }, height: { ideal: height } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("live");
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setError("Camera permission denied. Allow access or upload a frame.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("unavailable");
        setError("No camera matched that request. Upload a frame instead.");
      } else {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Camera failed to start.");
      }
    }
  }, [facingMode, height, width]);

  /** Paints the current frame to a canvas and returns it as a JPEG blob. */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.92,
      );
    });
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, error, start, stop, capture };
}
