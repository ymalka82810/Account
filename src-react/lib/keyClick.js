// נקישה רכה למקשי המקלדת, מסונתזת ב-WebAudio (בלי קובץ שמע): "טפיפה" קצרה ועמוקה, גל סינוס שיורד מהר בגובה הצליל
// ועובר מסנן שמעמעם את הגבוהים, כך שהיא נשמעת כמו נגיעה ולא כמו טיק חד. עוצמה נמוכה וגובה משתנה מעט בכל הקשה.
// כיבוי: localStorage['kupa-kb-sound'] = '0'.
/** @type {AudioContext | null} */
let ctx = null;

const PITCH = { letter: 430, space: 300, del: 360, enter: 520 };

export function playKeyClick(/** @type {'letter' | 'space' | 'del' | 'enter'} */ kind = 'letter') {
  try {
    if (localStorage.getItem('kupa-kb-sound') === '0') return;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const f0 = PITCH[kind] * (0.95 + Math.random() * 0.1);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.045);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(lp).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  } catch { /* אין שמע במכשיר או שהדפדפן חסם: ממשיכים בלי צליל */ }
}
