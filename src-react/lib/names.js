// השוואת שמות (בלי תלות בדפדפן): משמשת את הפנקס האישי ואת האיחוד מול בני המשפחה.
// נירמול לצורך השוואה: בלי ניקוד, סימני פיסוק ורווחים כפולים, ובלי הבדל גדול/קטן.
export function normName(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0591-\u05C7\u0300-\u036f]/g, '')
    .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// 'same' = אותו שם (אחרי נירמול), 'similar' = שם דומה (למשל דני/דניאל, יוסי/יוסף), אחרת null.
export function nameMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return null;
  if (x === y) return 'same';
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.startsWith(short)) return 'similar';
  // אותו שם פרטי עם שם משפחה בצד אחד בלבד ("דני" מול "דני כהן") נתפס כבר בבדיקה למעלה.
  const limit = long.length >= 7 ? 2 : 1;
  if (short.length >= 3 && editDistance(x, y) <= limit) return 'similar';
  return null;
}

