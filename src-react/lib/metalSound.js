// צליל מתכתי לנקישה על מטיל: "טינג" של מתכת כבדה, מסונתז ב-WebAudio (בלי קובץ שמע).
// פגיעה קצרה ורועשת (רעש מסונן) ואחריה כמה גלים סינוסיים לא הרמוניים שדועכים לאט, כמו מטיל זהב שנקשים עליו.
// כיבוי: localStorage['kupa-bar-sound'] = '0'.
/** @type {AudioContext | null} */
let ctx = null;

// יחסי הצלילים החלקיים של מתכת (לא הרמוניים) והעוצמה היחסית וזמן הדעיכה של כל אחד
const PARTIALS = [[1, 1, 0.9], [2.32, 0.65, 0.6], [4.19, 0.45, 0.4], [6.7, 0.25, 0.25]];

export function playMetalClink() {
  try {
    if (localStorage.getItem('kupa-bar-sound') === '0') return;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const base = 1250 * (0.94 + Math.random() * 0.12);
    const master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);

    PARTIALS.forEach(([ratio, amp, decay]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * 0.5, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });

    // הפגיעה עצמה: פעימת רעש קצרה במסנן גבוה
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    noise.connect(hp).connect(ng).connect(master);
    noise.start(t);
  } catch { /* אין שמע במכשיר או שהדפדפן חסם: ממשיכים בלי צליל */ }
}

// מאזין אחד לכל המטילים (.sum) באפליקציה, כולל אלה שנבנים מחדש בעת החלפת מסך או שפה.
export function initBarTapSound() {
  document.addEventListener('pointerdown', (e) => {
    const el = /** @type {Element | null} */ (e.target instanceof Element ? e.target.closest('.sum') : null);
    if (el) playMetalClink();
  }, { passive: true });
}
