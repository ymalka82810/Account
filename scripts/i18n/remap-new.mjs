// חד-פעמי: מסדר מחדש את קובצי התרגום לפי keys.json החדש (אחרי שנוספו מפתחות באמצע) ומוסיף 8 תרגומים חדשים.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const newKeys = JSON.parse(readFileSync('scripts/i18n/keys.json', 'utf8'));
const oldKeys = Object.keys(JSON.parse(readFileSync('src-react/i18n/locales/en.json', 'utf8')));
const ADD = [
  '🏠 יצירת קופה משפחתית',
  '👀 מצב דמו: נתוני דוגמה, שום דבר לא נשמר',
  '👀 רוצים לראות איך זה עובד? דמו של 10 שניות',
  'זה דמו, אז אי אפשר לשנות כלום. הקימו קופה משלכם!',
  'יציאה מהדמו',
  'יש לכם קוד משפחה? כניסה לקופה',
  'צרו קופה משפחתית: כולם רואים את אותו חשבון, והחובות מתעדכנים לכולם.',
  'רוצים שהחייבים יראו את זה?',
];
const T = {
  en: ['🏠 Create a family wallet', '👀 Demo mode: sample data, nothing is saved', '👀 Want to see how it works? A 10-second demo', "This is a demo, so nothing can be changed. Create your own wallet!", 'Exit the demo', 'Have a family code? Sign in to the wallet', 'Create a family wallet: everyone sees the same account, and debts update for everyone.', 'Want the people who owe you to see this?'],
  fr: ['🏠 Créer une cagnotte familiale', "👀 Mode démo : données d'exemple, rien n'est enregistré", '👀 Envie de voir comment ça marche ? Une démo de 10 secondes', "Ceci est une démo, rien ne peut être modifié. Créez votre propre cagnotte !", 'Quitter la démo', 'Vous avez un code famille ? Accédez à la cagnotte', "Créez une cagnotte familiale : tout le monde voit le même compte, et les dettes se mettent à jour pour tous.", 'Voulez-vous que les débiteurs voient cela ?'],
  nl: ['🏠 Een gezinskas aanmaken', '👀 Demomodus: voorbeeldgegevens, er wordt niets opgeslagen', '👀 Wil je zien hoe het werkt? Een demo van 10 seconden', 'Dit is een demo, dus er kan niets worden gewijzigd. Maak je eigen kas aan!', 'De demo verlaten', 'Heb je een gezinscode? Ga naar de kas', 'Maak een gezinskas aan: iedereen ziet dezelfde rekening en de schulden worden voor iedereen bijgewerkt.', 'Wil je dat degenen die jou geld schuldig zijn dit zien?'],
  de: ['🏠 Eine Familienkasse erstellen', '👀 Demomodus: Beispieldaten, nichts wird gespeichert', '👀 Möchtest du sehen, wie es funktioniert? Eine 10-Sekunden-Demo', 'Das ist eine Demo, daher kann nichts geändert werden. Erstelle deine eigene Kasse!', 'Demo beenden', 'Hast du einen Familiencode? Zur Kasse anmelden', 'Erstelle eine Familienkasse: Alle sehen dasselbe Konto, und die Schulden werden für alle aktualisiert.', 'Sollen die Schuldner das sehen?'],
  it: ['🏠 Crea una cassa di famiglia', '👀 Modalità demo: dati di esempio, nulla viene salvato', '👀 Vuoi vedere come funziona? Una demo di 10 secondi', 'Questa è una demo, quindi non si può modificare nulla. Crea la tua cassa!', 'Esci dalla demo', 'Hai un codice famiglia? Accedi alla cassa', 'Crea una cassa di famiglia: tutti vedono lo stesso conto e i debiti si aggiornano per tutti.', 'Vuoi che i debitori lo vedano?'],
  es: ['🏠 Crear una hucha familiar', '👀 Modo demo: datos de ejemplo, no se guarda nada', '👀 ¿Quieres ver cómo funciona? Una demo de 10 segundos', 'Esto es una demo, así que no se puede cambiar nada. ¡Crea tu propia hucha!', 'Salir de la demo', '¿Tienes un código de familia? Entra en la hucha', 'Crea una hucha familiar: todos ven la misma cuenta y las deudas se actualizan para todos.', '¿Quieres que los deudores vean esto?'],
  pt: ['🏠 Criar um cofre familiar', '👀 Modo demonstração: dados de exemplo, nada é guardado', '👀 Queres ver como funciona? Uma demonstração de 10 segundos', 'Isto é uma demonstração, por isso não se pode alterar nada. Cria o teu próprio cofre!', 'Sair da demonstração', 'Tens um código de família? Entra no cofre', 'Cria um cofre familiar: todos veem a mesma conta e as dívidas atualizam-se para todos.', 'Queres que os devedores vejam isto?'],
  el: ['🏠 Δημιουργία οικογενειακού ταμείου', '👀 Λειτουργία επίδειξης: δείγμα δεδομένων, δεν αποθηκεύεται τίποτα', '👀 Θέλεις να δεις πώς λειτουργεί; Επίδειξη 10 δευτερολέπτων', 'Αυτή είναι επίδειξη, οπότε δεν μπορεί να αλλάξει τίποτα. Δημιούργησε το δικό σου ταμείο!', 'Έξοδος από την επίδειξη', 'Έχεις κωδικό οικογένειας; Είσοδος στο ταμείο', 'Δημιούργησε οικογενειακό ταμείο: όλοι βλέπουν τον ίδιο λογαριασμό και τα χρέη ενημερώνονται για όλους.', 'Θέλεις να το βλέπουν όσοι σου χρωστούν;'],
  ru: ['🏠 Создать семейную кассу', '👀 Демо-режим: примерные данные, ничего не сохраняется', '👀 Хотите увидеть, как это работает? Демо на 10 секунд', 'Это демо, поэтому ничего нельзя изменить. Создайте собственную кассу!', 'Выйти из демо', 'Есть код семьи? Войти в кассу', 'Создайте семейную кассу: все видят один и тот же счёт, а долги обновляются у всех.', 'Хотите, чтобы должники это видели?'],
  uk: ['🏠 Створити сімейну касу', '👀 Демо-режим: приклад даних, нічого не зберігається', '👀 Хочете побачити, як це працює? Демо на 10 секунд', 'Це демо, тому нічого змінити не можна. Створіть власну касу!', 'Вийти з демо', 'Маєте код родини? Увійти в касу', 'Створіть сімейну касу: усі бачать один і той самий рахунок, а борги оновлюються в усіх.', 'Хочете, щоб боржники це бачили?'],
  pl: ['🏠 Załóż rodzinną kasę', '👀 Tryb demo: przykładowe dane, nic nie jest zapisywane', '👀 Chcesz zobaczyć, jak to działa? Demo na 10 sekund', 'To jest demo, więc nic nie można zmienić. Załóż własną kasę!', 'Zakończ demo', 'Masz kod rodziny? Wejdź do kasy', 'Załóż rodzinną kasę: wszyscy widzą to samo konto, a długi aktualizują się dla wszystkich.', 'Chcesz, żeby dłużnicy to widzieli?'],
  cs: ['🏠 Založit rodinnou pokladnu', '👀 Demo režim: ukázková data, nic se neukládá', '👀 Chcete vidět, jak to funguje? Demo na 10 sekund', 'Toto je demo, takže nelze nic měnit. Založte si vlastní pokladnu!', 'Ukončit demo', 'Máte kód rodiny? Vstupte do pokladny', 'Založte rodinnou pokladnu: všichni vidí stejný účet a dluhy se aktualizují všem.', 'Chcete, aby to dlužníci viděli?'],
  hu: ['🏠 Családi kassza létrehozása', '👀 Demó mód: mintaadatok, semmi sem mentődik', '👀 Szeretnéd látni, hogyan működik? 10 másodperces demó', 'Ez egy demó, ezért semmi sem módosítható. Hozd létre a saját kasszádat!', 'Kilépés a demóból', 'Van családkódod? Belépés a kasszába', 'Hozz létre családi kasszát: mindenki ugyanazt a számlát látja, és az adósságok mindenkinél frissülnek.', 'Szeretnéd, ha az adósok is látnák ezt?'],
  sv: ['🏠 Skapa en familjekassa', '👀 Demoläge: exempeldata, inget sparas', '👀 Vill du se hur det fungerar? En demo på 10 sekunder', 'Det här är en demo, så inget kan ändras. Skapa din egen kassa!', 'Avsluta demon', 'Har du en familjekod? Logga in i kassan', 'Skapa en familjekassa: alla ser samma konto och skulderna uppdateras för alla.', 'Vill du att de som är skyldiga dig pengar ska se det här?'],
  nb: ['🏠 Opprett en familiekasse', '👀 Demomodus: eksempeldata, ingenting lagres', '👀 Vil du se hvordan det fungerer? En demo på 10 sekunder', 'Dette er en demo, så ingenting kan endres. Opprett din egen kasse!', 'Avslutt demoen', 'Har du en familiekode? Logg inn i kassen', 'Opprett en familiekasse: alle ser den samme kontoen, og gjeldene oppdateres for alle.', 'Vil du at de som skylder deg penger skal se dette?'],
  da: ['🏠 Opret en familiekasse', '👀 Demotilstand: eksempeldata, intet gemmes', '👀 Vil du se, hvordan det virker? En demo på 10 sekunder', 'Dette er en demo, så intet kan ændres. Opret din egen kasse!', 'Afslut demoen', 'Har du en familiekode? Log ind i kassen', 'Opret en familiekasse: alle ser den samme konto, og gælden opdateres for alle.', 'Vil du have, at dem, der skylder dig penge, kan se det her?'],
  tr: ['🏠 Aile kasası oluştur', '👀 Demo modu: örnek veriler, hiçbir şey kaydedilmez', '👀 Nasıl çalıştığını görmek ister misin? 10 saniyelik demo', 'Bu bir demo, bu yüzden hiçbir şey değiştirilemez. Kendi kasanı oluştur!', 'Demodan çık', 'Aile kodun var mı? Kasaya giriş yap', 'Bir aile kasası oluştur: herkes aynı hesabı görür ve borçlar herkes için güncellenir.', 'Sana borcu olanların bunu görmesini ister misin?'],
  ar: ['🏠 إنشاء محفظة عائلية', '👀 وضع العرض التجريبي: بيانات نموذجية ولا يُحفظ أي شيء', '👀 هل تريد أن ترى كيف تعمل؟ عرض تجريبي لمدة 10 ثوانٍ', 'هذا عرض تجريبي، لذا لا يمكن تغيير أي شيء. أنشئ محفظتك الخاصة!', 'الخروج من العرض التجريبي', 'هل لديك رمز العائلة؟ ادخل إلى المحفظة', 'أنشئ محفظة عائلية: يرى الجميع الحساب نفسه وتتحدّث الديون للجميع.', 'هل تريد أن يرى المدينون لك هذا؟'],
  hi: ['🏠 पारिवारिक वॉलेट बनाएँ', '👀 डेमो मोड: नमूना डेटा, कुछ भी सेव नहीं होता', '👀 देखना चाहते हैं कि यह कैसे काम करता है? 10 सेकंड का डेमो', 'यह एक डेमो है, इसलिए कुछ भी बदला नहीं जा सकता। अपना खुद का वॉलेट बनाएँ!', 'डेमो से बाहर निकलें', 'क्या आपके पास परिवार कोड है? वॉलेट में साइन इन करें', 'पारिवारिक वॉलेट बनाएँ: सभी को एक ही खाता दिखता है और कर्ज़ सबके लिए अपडेट हो जाते हैं।', 'क्या आप चाहते हैं कि जिन पर आपका पैसा बकाया है, वे इसे देखें?'],
  zh: ['🏠 创建家庭钱包', '👀 演示模式：示例数据，不会保存任何内容', '👀 想看看它是怎么运作的吗？10 秒演示', '这是演示，因此无法更改任何内容。创建你自己的钱包吧！', '退出演示', '有家庭代码吗？登录钱包', '创建家庭钱包：所有人看到同一个账户，债务会为所有人同步更新。', '想让欠你钱的人也看到这个吗？'],
  ja: ['🏠 ファミリーウォレットを作成', '👀 デモモード：サンプルデータで、何も保存されません', '👀 使い方を見てみませんか？10秒のデモ', 'これはデモなので、何も変更できません。自分のウォレットを作成しましょう！', 'デモを終了', 'ファミリーコードをお持ちですか？ウォレットにログイン', 'ファミリーウォレットを作成：全員が同じアカウントを見て、借金は全員に反映されます。', 'お金を借りている人にもこれを見せますか？'],
  th: ['🏠 สร้างกระเป๋าเงินครอบครัว', '👀 โหมดสาธิต: ข้อมูลตัวอย่าง ไม่มีการบันทึกใด ๆ', '👀 อยากดูว่าใช้งานอย่างไร? สาธิต 10 วินาที', 'นี่คือโหมดสาธิต จึงเปลี่ยนแปลงอะไรไม่ได้ สร้างกระเป๋าเงินของคุณเองเลย!', 'ออกจากโหมดสาธิต', 'มีรหัสครอบครัวไหม? เข้าสู่กระเป๋าเงิน', 'สร้างกระเป๋าเงินครอบครัว: ทุกคนเห็นบัญชีเดียวกัน และหนี้จะอัปเดตให้ทุกคน', 'ต้องการให้คนที่เป็นหนี้คุณเห็นสิ่งนี้ไหม?'],
};

for (const f of readdirSync('scripts/i18n/translations').filter((x) => x.endsWith('.txt'))) {
  const lang = f.slice(0, -4);
  const lines = readFileSync(`scripts/i18n/translations/${f}`, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const byKey = new Map();
  for (const l of lines) { const b = l.indexOf('|'); byKey.set(oldKeys[Number(l.slice(0, b))], l.slice(b + 1)); }
  ADD.forEach((k, i) => { if (!T[lang]) throw new Error('no ' + lang); byKey.set(k, T[lang][i]); });
  const out = newKeys.map((k, i) => {
    if (!byKey.has(k)) throw new Error(`${lang}: missing ${k}`);
    return `${i}|${byKey.get(k)}`;
  });
  writeFileSync(`scripts/i18n/translations/${f}`, out.join('\n') + '\n');
}
console.log('remapped', newKeys.length);
