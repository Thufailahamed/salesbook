"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface DetectedCode {
  rawValue: string;
}
interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

/** True when the browser can read barcodes from the camera (Chrome/Edge/Android, recent Safari). */
export const cameraScanSupported = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * Live camera viewfinder that reports each barcode it reads (EAN/UPC/Code 128/QR…) via the browser's built-in
 * BarcodeDetector, so no extra library. The same code is not reported again for 2 seconds.
 */
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const last = { code: "", at: 0 };

    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const [hit] = await detector.detect(video);
            const code = hit?.rawValue?.trim();
            if (code && (code !== last.code || Date.now() - last.at > 2000)) {
              last.code = code;
              last.at = Date.now();
              onCodeRef.current(code);
            }
          } catch {
            /* a frame that can't be read is just skipped */
          }
          timer = setTimeout(tick, 250);
        };
        void tick();
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser settings." : "Couldn't start the camera.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      {error ? (
        <p className="p-6 text-center text-sm text-white/80">{error}</p>
      ) : (
        <div className="relative">
          <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[28%] -translate-y-1/2 rounded-xl border-2 border-white/80" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 bg-card px-3 py-2">
        <p className="text-[12.5px] text-muted-foreground">Hold the barcode inside the frame.</p>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Close camera
        </Button>
      </div>
    </div>
  );
}
