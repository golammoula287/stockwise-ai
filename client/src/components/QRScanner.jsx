import { useEffect, useRef, useState } from 'react';

export default function QRScanner({ onScan }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const cancelled = useRef(false);
  const stop = () => { cancelled.current = true; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setRunning(false); };
  useEffect(() => () => { cancelled.current = true; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  const decode = async source => {
    const width = source.videoWidth || source.width;
    const height = source.videoHeight || source.height;
    if (!width || !height) return null;
    const scale = Math.min(1, 1000 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import('jsqr');
    return jsQR(data.data, data.width, data.height)?.data;
  };
  const found = value => {
    let code = value.trim();
    try { const parsed = JSON.parse(code); code = String(parsed.sku || parsed.productId || parsed.id || ''); } catch { /* Plain SKU QR codes are supported. */ }
    if (!code || code.length > 200 || /^https?:/i.test(code)) { setMessage('Use a QR code containing a product SKU or product ID.'); return false; }
    stop(); onScan(code); setMessage('Product code scanned. Review the product before adding it.'); return true;
  };
  const start = async () => {
    stop(); cancelled.current = false; setMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use HTTPS or localhost to access the camera. You can also upload a QR image.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (cancelled.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; video.current.srcObject = media; await video.current.play(); setRunning(true);
      const tick = async () => {
        if (cancelled.current) return;
        try { const value = await decode(video.current); if (!cancelled.current && value && found(value)) return; } catch { setMessage('Could not read the camera frame. Try a QR image.'); stop(); return; }
        if (!cancelled.current) setTimeout(tick, 250);
      }; tick();
    } catch (error) { if (!cancelled.current) setMessage(error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow access or upload a QR image.' : error.message || 'Camera unavailable. Upload a QR image instead.'); stop(); }
  };
  const upload = async event => {
    stop(); const file = event.target.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage('Choose a PNG, JPG, or WebP image under 5 MB.'); return; }
    let bitmap;
    try { bitmap = await createImageBitmap(file); const value = await decode(bitmap); if (!value) setMessage('No QR code found. Try a clearer image.'); else found(value); }
    catch { setMessage('Could not read this QR image.'); }
    finally { bitmap?.close(); event.target.value = ''; }
  };
  return <div className="mt-3"><button type="button" className="text-xs font-semibold text-blue-700" aria-expanded={open} onClick={() => { stop(); setOpen(value => !value); }}> {open ? 'Close QR scanner' : 'Scan product QR'} </button>{open && <div className="mt-3 border rounded-xl p-3 space-y-3 bg-slate-50"><p className="text-xs text-slate-500">Scan a product SKU or ID. Images are processed on your device.</p><video ref={video} playsInline muted className={running ? 'w-full rounded-lg aspect-video object-cover' : 'hidden'} /><div className="flex gap-3"><button type="button" className="text-xs text-blue-700" onClick={running ? stop : start}>{running ? 'Stop camera' : 'Start camera'}</button><label className="text-xs text-blue-700 cursor-pointer">Upload QR<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label></div>{message && <p role="status" className="text-xs text-slate-600">{message}</p>}</div>}</div>;
}
