'use client';

import { useRef, useState } from 'react';
import { Camera, Images, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_PHOTOS = 3;
const MAX_BYTES = 3 * 1024 * 1024;

export function ProofPhotoPicker({
  name,
  title,
  disabled = false,
  onValidityChange,
}: {
  name: string;
  title: string;
  disabled?: boolean;
  onValidityChange: (valid: boolean) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [cameraFiles, setCameraFiles] = useState<File[]>([]);
  const [chosenFiles, setChosenFiles] = useState<File[]>([]);
  const selected = [...cameraFiles, ...chosenFiles];
  const valid = selected.length > 0 && selected.length <= MAX_PHOTOS && selected.every((file) => file.type.startsWith('image/') && file.size <= MAX_BYTES);

  function update(camera: File[], files: File[]) {
    setCameraFiles(camera);
    setChosenFiles(files);
    const all = [...camera, ...files];
    onValidityChange(all.length > 0 && all.length <= MAX_PHOTOS && all.every((file) => file.type.startsWith('image/') && file.size <= MAX_BYTES));
  }

  return (
    <div className="rounded-xl border border-dashed border-[#d6b98d] bg-[#fcfaf7] p-4 dark:bg-[#241e17]">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">1–3 images, maximum 3 MB each. Take a photo or choose existing files.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => cameraRef.current?.click()} className="min-h-10"><Camera aria-hidden="true" /> Open camera</Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => filesRef.current?.click()} className="min-h-10"><Images aria-hidden="true" /> Choose files</Button>
        {selected.length ? <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { if (cameraRef.current) cameraRef.current.value = ''; if (filesRef.current) filesRef.current.value = ''; update([], []); }} className="min-h-10"><X aria-hidden="true" /> Clear</Button> : null}
      </div>
      <input ref={cameraRef} name={name} type="file" accept="image/*" capture="environment" aria-label={`Capture ${title.toLowerCase()}`} className="sr-only" onChange={(event) => update(Array.from(event.target.files ?? []), chosenFiles)} />
      <input ref={filesRef} name={name} type="file" accept="image/*" multiple aria-label={`Choose ${title.toLowerCase()} files`} className="sr-only" onChange={(event) => update(cameraFiles, Array.from(event.target.files ?? []))} />
      {selected.length ? <p className={`mt-3 break-words text-xs ${valid ? 'text-emerald-700' : 'text-red-600'}`} aria-live="polite">{selected.map((file) => file.name).join(', ')}{valid ? '' : ' — use up to 3 images, 3 MB each'}</p> : null}
    </div>
  );
}
