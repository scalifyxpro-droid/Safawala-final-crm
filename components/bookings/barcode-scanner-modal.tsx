'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { decodeCode128Scanline, scanlineRuns } from '@/lib/barcode/code128';

// Product barcodes are almost always 1D (Code128 / EAN / UPC), with QR kept
// in as a bonus since some labels use it instead. Not every platform
// accepts every one of these — see the retry-without-formats fallback below.
const PREFERRED_FORMATS = [
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'qr_code',
];

// Fractions of the frame height to scan for the built-in fallback engine —
// several rows in case the barcode isn't perfectly centered vertically.
const SCAN_ROW_FRACTIONS = [0.4, 0.45, 0.5, 0.55, 0.6];
const MAX_CANVAS_WIDTH = 640;

type NativeBarcodeDetector = {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
};
type NativeBarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => NativeBarcodeDetector;

type Status = 'starting' | 'scanning' | 'error';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getNativeDetector() {
  return (window as Window & { BarcodeDetector?: NativeBarcodeDetectorCtor })
    .BarcodeDetector;
}

/**
 * Shared camera-barcode-scan modal used by both the New Booking form and the
 * Edit Booking form (sale + rental, both places).
 *
 * Two scanning engines, no external package required for either:
 *
 * 1. The browser's own built-in `BarcodeDetector` API, when available (fast,
 *    handles every common symbology). Missing entirely in Safari/iOS and
 *    Firefox, and on plenty of desktop/laptop Chrome builds too.
 * 2. A small Code 128 decoder written directly into this app (see
 *    lib/barcode/code128.ts) for every device without the API above —
 *    including most laptops. It reads frames straight off the same video
 *    element, so camera scanning works the same way everywhere a camera can
 *    be opened at all, with nothing to install.
 *
 * Either way, typing the barcode and pressing "+" or using a USB/Bluetooth
 * scanner gun (useHardwareScannerListener, active on both booking screens)
 * keeps working regardless — the camera is a convenience, not the only path.
 */
export function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState<Status>('starting');
  const [errorText, setErrorText] = useState('');
  const [engine, setEngine] = useState<'native' | 'builtin' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('starting');
    setErrorText('');
    setEngine(null);

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorText(
          'This browser cannot open a camera here — it needs a secure (https) connection.',
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setErrorText(
          error instanceof Error && error.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
            : `Could not open the camera (${errorMessage(error)}).`,
        );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Fast path: the browser's own barcode detector, when it exists and
      // can actually be constructed here.
      const NativeDetector = getNativeDetector();
      if (NativeDetector) {
        let detector: NativeBarcodeDetector | null = null;
        try {
          detector = new NativeDetector({ formats: PREFERRED_FORMATS });
        } catch {
          try {
            // Some platforms reject part of the preferred format list —
            // retry with the browser's own default set instead of failing.
            detector = new NativeDetector();
          } catch (error) {
            console.error(
              'Native barcode detector unavailable, falling back to built-in scanner',
              error,
            );
            detector = null;
          }
        }
        if (detector) {
          const activeDetector = detector;
          setStatus('scanning');
          setEngine('native');
          const loop = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const found = await activeDetector.detect(videoRef.current);
              if (found[0]?.rawValue) {
                onDetectedRef.current(found[0].rawValue);
                return;
              }
            } catch {
              // Transient decode failure (e.g. a blurry frame) — keep trying.
            }
            window.setTimeout(loop, 220);
          };
          window.setTimeout(loop, 400);
          return;
        }
      }

      // Fallback for every device without a working native detector
      // (Safari/iOS, Firefox, and most laptop/desktop browsers): decode
      // Code 128 directly from the video frames ourselves.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setStatus('error');
        setErrorText('This browser cannot process camera frames for scanning.');
        return;
      }
      setStatus('scanning');
      setEngine('builtin');
      const loop = () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, MAX_CANVAS_WIDTH / video.videoWidth);
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          for (const fraction of SCAN_ROW_FRACTIONS) {
            const runs = scanlineRuns(imageData, Math.floor(height * fraction));
            if (runs.length < 20) continue;
            const text = decodeCode128Scanline(runs);
            if (text) {
              onDetectedRef.current(text);
              return;
            }
          }
        }
        window.setTimeout(loop, 200);
      };
      window.setTimeout(loop, 400);
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, attempt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between border-b px-5 py-4">
          <CardTitle className="text-lg">Scan product barcode</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close scanner"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
            {status !== 'error' ? (
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-16 -translate-y-1/2 rounded-lg border-2 border-white/70" />
            ) : null}
          </div>
          {status === 'error' ? (
            <p className="text-center text-sm text-destructive">{errorText}</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {status === 'starting'
                ? 'Starting camera…'
                : engine === 'builtin'
                  ? 'Line the barcode up inside the box, well lit and in focus.'
                  : 'Point the camera at a product barcode.'}
            </p>
          )}
          <div className="flex gap-2">
            {status === 'error' ? (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw className="size-4" />
                Try again
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Close camera
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
