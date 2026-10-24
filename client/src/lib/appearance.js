export const backgrounds = {
  paper: { label: 'Paper', value: '#f5f7fb' },
  blue: { label: 'Soft blue', value: 'linear-gradient(135deg,#eef3ff,#f8fbff)' },
  warm: { label: 'Warm neutral', value: 'linear-gradient(135deg,#f5f1eb,#faf9f6)' },
  mint: { label: 'Soft mint', value: 'linear-gradient(135deg,#eaf4f0,#f7fbf9)' },
};
export const appearanceKey = id => `stockwise-appearance-${id || 'visitor'}`;
export function readAppearance(id) {
  try { const value = JSON.parse(localStorage.getItem(appearanceKey(id)) || '{}'); return { preset: backgrounds[value.preset] ? value.preset : 'paper', image: /^data:image\/(png|jpeg|webp);base64,/.test(value.image || '') ? value.image : '' }; }
  catch { return { preset: 'paper', image: '' }; }
}
export function appearanceStyle(value) {
  return { background: value.image ? `linear-gradient(#f8faffdf,#f8faffdf),url("${value.image}") center/cover fixed` : backgrounds[value.preset]?.value || backgrounds.paper.value };
}
