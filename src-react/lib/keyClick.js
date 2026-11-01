// נקישה קלה למקשי המקלדת, מסונתזת ב-WebAudio (בלי קובץ שמע): פעימת רעש קצרה מאוד דרך מסנן, שנשמעת כמו הקשה רכה.
// עוצמה נמוכה וגובה צליל משתנה מעט בכל הקשה, כדי שלא יישמע מכני ולא יציק. כיבוי: localStorage['kupa-kb-sound'] = '0'.
/** @type {AudioContext | null} */
let ctx = null;
/** @type {AudioBuffer | null} */
let noise = null;

const PITCH = { letter: 2100, space: 1500, del: 1700, enter: 2600 };

export function playKeyClick(/** @type {'letter' | 'space' | 'del' | 'enter'} */ kind = 'letter') {
  try {
    if (localStorage.getItem('kupa-kb-sound') === '0') return;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.04), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = PITCH[kind] * (0.93 + Math.random() * 0.14);
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.04);
  } catch { /* אין שמע במכשיר או שהדפדפן חסם: ממשיכים בלי צליל */ }
}
