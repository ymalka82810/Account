import { t } from '../../i18n/index.js';
import { moneyWithValue } from '../../lib/computations.js';

// תזכורת לחייב בוואטסאפ: פותח את וואטסאפ עם הודעה מוכנה, ואת איש הקשר בוחרים שם.
// לא שומרים ולא שולחים לשרת שום מספר טלפון, אז אין צורך לשנות את מדיניות הפרטיות.
// open = החובות הפתוחים של הזוג. עם חוב אחד שולחים את הסכום שלו במטבע שלו (עם השווי הנוכחי) ואת ההערה;
// עם כמה חובות שולחים את הסכום הכולל (total, במטבע התצוגה).
export default function WhatsAppRemind({ name, open, total, display }) {
  const one = open.length === 1 ? open[0] : null;
  const amount = one ? moneyWithValue(one.remaining, one.cur, display) : total;
  const note = one?.debt.note;
  const send = () => {
    const text = note
      ? t('היי {name}, תזכורת קטנה: נשארו {amount} על {note}. תודה! 🙏', { name, amount, note })
      : t('היי {name}, תזכורת קטנה: נשארו {amount} להחזיר. תודה! 🙏', { name, amount });
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  return (
    <button className="small" type="button" onClick={send}>{t('💬 תזכורת בוואטסאפ')}</button>
  );
}
