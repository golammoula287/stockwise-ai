import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { backgrounds, appearanceKey, readAppearance } from '../lib/appearance';

export default function AppearanceSettings() {
  const { user } = useAuth();
  const id = user?.id || user?._id;
  const [value, setValue] = useState(() => readAppearance(id));
  const [message, setMessage] = useState('');
  const save = next => {
    try { localStorage.setItem(appearanceKey(id), JSON.stringify(next)); setValue(next); window.dispatchEvent(new Event('stockwise-appearance')); setMessage('Background updated for this account on this browser.'); }
    catch { setMessage('Could not save this image. Try a smaller file.'); }
  };
  const upload = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setMessage('Choose a PNG, JPG, or WebP image under 2 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => save({ ...value, image: String(reader.result) }); reader.onerror = () => setMessage('Could not read this image.'); reader.readAsDataURL(file);
  };
  return <section className="space-y-5 max-w-xl"><div><h2 className="font-semibold text-slate-900">Workspace background</h2><p className="text-sm text-slate-500 mt-2">Choose a quiet color or add your own image. Your choice stays on this browser.</p></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Object.entries(backgrounds).map(([key, preset]) => <button key={key} type="button" aria-pressed={!value.image && value.preset === key} onClick={() => save({ preset: key, image: '' })} className={`border rounded-xl p-3 text-xs ${!value.image && value.preset === key ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'}`}><span className="block h-14 rounded-lg mb-3 border border-slate-200" style={{ background: preset.value }} />{preset.label}</button>)}</div><label className="block text-sm font-medium text-slate-700">Custom image<input className="block mt-2 text-xs max-w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></label><button type="button" onClick={() => save({ preset: 'paper', image: '' })} className="text-sm text-blue-700">Reset background</button>{message && <p role="status" className="text-xs text-slate-600">{message}</p>}</section>;
}
