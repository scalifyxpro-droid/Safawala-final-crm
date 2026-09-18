'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Images, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_BYTES = 3 * 1024 * 1024;

export function QcPhotoPicker({ files, onChange, disabled }: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const capturing = useRef(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function close() { stop(); setOpen(false); setReady(false); }
  useEffect(() => {
    const activeStream = stream;
    const activeGeneration = generation;
    return () => {
      activeGeneration.current++;
      activeStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (disabled) {
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setOpen(false);
      setReady(false);
    }
  }, [disabled]);

  async function openCamera() {
    if (disabled || files.length >= 3 || open) return;
    setError(''); setReady(false); setOpen(true);
    const attempt = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this page over HTTPS in Safari or Chrome to use the camera.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (attempt !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      if (!video.current) throw new Error('Camera preview could not open. Please try again.');
      video.current.srcObject = media;
      await video.current.play();
    } catch (cause) {
      if (attempt !== generation.current) return;
      close();
      const name = cause instanceof Error ? cause.name : '';
      setError(name === 'NotAllowedError' ? 'Allow camera access in your browser settings, then tap Open camera again.' :
        name === 'NotFoundError' ? 'No camera was found on this device. You can choose an existing photo.' :
        name === 'NotReadableError' ? 'The camera is busy. Close other apps using it and try again.' :
        cause instanceof Error ? cause.message : 'Unable to open the camera. Please try again.');
    }
  }

  function add(newFiles: File[]) {
    if (files.length + newFiles.length > 3) { setError('Use up to 3 photos. Remove a photo before adding another.'); return false; }
    if (newFiles.some((file) => !file.type.startsWith('image/') || file.size === 0 || file.size > MAX_BYTES)) {
      setError('Choose images no larger than 3 MB each.'); return false;
    }
    onChange([...files, ...newFiles]); setError(''); return true;
  }

  async function capture() {
    if (!ready || capturing.current || disabled || !video.current) return;
    capturing.current = true; setBusy(true); setError('');
    const attempt = generation.current;
    try {
      const source = video.current;
      if (!source.videoWidth || !source.videoHeight) throw new Error('Wait for the camera preview, then try again.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1920 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.max(1, Math.round(source.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(source.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture this photo. Please try again.');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      let blob: Blob | null = null;
      for (const quality of [0.85, 0.65, 0.45]) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= MAX_BYTES) break;
      }
      if (!blob || blob.size > MAX_BYTES) throw new Error('Could not capture a photo under 3 MB. Please try again.');
      if (attempt !== generation.current) return;
      if (add([new File([blob], `qc-proof-${Date.now()}.jpg`, { type: 'image/jpeg' })])) close();
    } catch (cause) {
      if (attempt === generation.current) setError(cause instanceof Error ? cause.message : 'Photo capture failed. Please try again.');
    } finally { capturing.current = false; setBusy(false); }
  }

  return <section className="rounded-xl border border-dashed border-[#d6b98d] bg-[#fcfaf7] p-4 dark:bg-[#241e17]" aria-label="Product QC proof photos">
    <p className="text-sm font-medium">Product QC proof photos</p>
    <p className="mt-1 text-xs text-muted-foreground">1–3 photos, maximum 3 MB each. Capture a photo or choose files, then submit the quality check to save.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled || open || files.length >= 3} onClick={openCamera} className="min-h-10"><Camera /> Open camera</Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled || open || files.length >= 3} onClick={() => input.current?.click()} className="min-h-10"><Images /> Choose files</Button>
    </div>
    <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={disabled || open} aria-label="Choose QC proof photos" onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    {open ? <div className="mt-3 space-y-3 rounded-lg border bg-black p-2">
      <video ref={video} autoPlay muted playsInline onPlaying={() => setReady(true)} className="max-h-[55dvh] w-full rounded object-contain" aria-label="Live QC camera preview" />
      {!ready ? <p role="status" className="text-center text-sm text-white">Opening camera… Allow camera access if prompted.</p> : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" disabled={!ready || busy || disabled} onClick={capture} className="min-h-11"><Camera /> {busy ? 'Adding photo…' : 'Capture photo'}</Button>
        <Button type="button" variant="secondary" onClick={close} className="min-h-11"><X /> Close camera</Button>
      </div>
    </div> : null}
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="min-w-0 rounded-lg border p-2">
        {/* Local object URLs are revoked when files change or the picker unmounts. */}
        {previews[index] ? <Image unoptimized src={previews[index]} alt={`QC proof ${index + 1}`} width={192} height={112} className="h-28 w-full rounded object-cover" /> : null}
        <p className="mt-1 truncate text-xs">{file.name}</p>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || open} aria-label={`Remove QC photo ${index + 1}`} onClick={() => { onChange(files.filter((_, i) => i !== index)); setError(''); }}><X /> Remove</Button>
      </div>)}
    </div>
    {files.length ? <p role="status" className="mt-2 text-xs text-emerald-700">{files.length} photo(s) ready to submit.</p> : null}
  </section>;
}
