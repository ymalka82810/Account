// צליל מטבעות שנופלים זה על זה, מסונתז ב-WebAudio (בלי קובץ שמע, כך שהאפליקציה נשארת קלה).
// כל "קליק" הוא כמה גלים סינוסיים לא הרמוניים שדועכים מהר, וצפיפות הקליקים גדלה ואז נרגעת כמו מטבעות שנערמים.
/** @type {AudioContext | null} */
let ctx = null;

/**
 * @param {number} coins כמה מטבעות "נופלים" (קובע כמה קליקים)
 * @param {number} delay שניות עד הקליק הראשון
 * @param {number} span שניות שבהן הקליקים מתפזרים
 */
export function playCoinSound(coins = 12, delay = 0.35, span = 1.1) {
  try {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const hits = Math.max(5, Math.min(coins, 18));
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const start = ctx.currentTime + delay;
    for (let i = 0; i < hits; i++) {
      // הפער בין הקליקים קטן ואז גדל: מטבעות שנופלים בסערה ומתיישבים
      const at = start + span * Math.pow(i / hits, 0.8) + Math.random() * 0.04;
      const base = 2300 + Math.random() * 1900;
      const vol = 0.35 + Math.random() * 0.65;
      [[1, 1], [2.76, 0.55], [5.4, 0.3]].forEach(([ratio, amp]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = base * ratio;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol * amp * 0.5, at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 + Math.random() * 0.14);
        osc.connect(g).connect(master);
        osc.start(at);
        osc.stop(at + 0.3);
      });
    }
  } catch { /* אין שמע במכשיר או שהדפדפן חסם: ממשיכים בלי צליל */ }
}
