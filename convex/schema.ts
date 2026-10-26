import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // משפחה = קופה אחת. כל האנשים והרשומות שייכים למשפחה.
  families: defineTable({
    name: v.string(),
    // קוד ההצטרפות היחיד של המשפחה (השם childCode נשאר מהגרסה הקודמת, שבה היו שני קודים).
    // כל מי שמצטרף/ת עם הקוד נכנס/ת בתור ילד/ה, והורה משנה תפקיד באישור ביומטרי.
    childCode: v.string(),
    // קוד ההורים הישן. כבר לא בשימוש ולא פותח כלום. נמחק כשמחליפים קוד.
    parentCode: v.optional(v.string()),
    createdAt: v.number(),
    // מדינת המגורים (קוד ISO, למשל IL) והמטבע הראשי של המשפחה (למשל ILS). חסר = ישראל ושקלים.
    country: v.optional(v.string()),
    currency: v.optional(v.string()),
  })
    .index("by_parentCode", ["parentCode"])
    .index("by_childCode", ["childCode"]),

  // כרטיסי כניסה למכשירים שבחרו "לזכור" את המשפחה. במקום לשמור במכשיר את קוד ההצטרפות,
  // שומרים שם כרטיס אקראי שפותח רק את מסך הכניסה של המשפחה (עדיין צריך קוד סודי אישי),
  // לא מגלה את הקוד, ונמחק כשמחליפים קוד או כשהמכשיר "שוכח" את המשפחה. בשרת נשמר רק הגיבוב.
  devicePasses: defineTable({
    familyId: v.id("families"),
    passHash: v.string(),
    createdAt: v.number(),
    // חסר = כרטיס ישן: פג 180 יום אחרי createdAt. כל כניסה מחדשת (auth:enter).
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    // שם שהמכשיר נתן לעצמו, כדי שהורה יזהה אותו ברשימה.
    label: v.optional(v.string()),
  })
    .index("by_hash", ["passHash"])
    .index("by_family", ["familyId"])
    .index("by_expires", ["expiresAt"]),

  people: defineTable({
    // חסר רק אצל נתונים מהגרסה של משפחה אחת. הם עוברים למשפחה בכניסה הראשונה של הורה.
    familyId: v.optional(v.id("families")),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child"), v.literal("teen")),
    avatar: v.optional(v.string()),
    // תאריך לידה (YYYY-MM-DD), הצהרה עצמית. נשמר רק אצל מי שהקים קופה (חייב להיות מעל 18).
    birthDate: v.optional(v.string()),
    // מגדר, לצורת פנייה מותאמת (זכר/נקבה). חסר = ללא ציון, וצורת הפנייה נשארת כפולה כמו היום.
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    // צבעי הניאון שנער/ה בחר/ה למסך שלו/ה. חסר = כחול+סגול.
    palette: v.optional(v.union(v.literal("blue"), v.literal("green"), v.literal("orange"))),
    // קוד סודי (גיבוב בלבד). אם חסר - הילד/ה בוחר/ת קוד בכניסה הראשונה.
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    // אורך הקוד (מספר ספרות), כדי שמסך הכניסה ידע מתי לשלוח. חסר = 4.
    pinLength: v.optional(v.number()),
    // הוצא משימוש: כבר לא נכתב. נשאר רק עד שמריצים maintenance:clearPinPlain, ואז מסירים.
    pinPlain: v.optional(v.string()),
    failedAttempts: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    // גיבובי מכשירים מהימנים (עד 5). רק כשלונות מהם נועלים את האדם; ראו lib.ts.
    trustedDevices: v.optional(v.array(v.string())),
    // נעילה מדורגת: רמה עולה בכל נעילה (דקה, 5 דקות, שעה...). מתאפסת בכניסה מוצלחת.
    lockLevel: v.optional(v.number()),
    // מייל להורים בלבד (לשינוי/איפוס קוד ולהתראות נעילה). pendingEmail = ממתין לאימות.
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    pendingEmail: v.optional(v.string()),
    // להתראה להורה: כמה נעילות היו ומתי הייתה האחרונה. מתאפס כשקובעים קוד חדש.
    lockCount: v.optional(v.number()),
    lastLockAt: v.optional(v.number()),
    // מצב חברים (לבני נוער בלבד). חייב אישור הורה. friendEmail = המייל שדרכו חברים מוסיפים אותו/ה.
    friendsEnabled: v.optional(v.boolean()),
    friendsRequested: v.optional(v.boolean()),
    friendEmail: v.optional(v.string()),
    // ישן: בקשת ילד/ה לעבור לנוער (הפיצ'ר הוסר). נשאר בסכמה כי יש מסמכים קיימים עם השדה,
    // ובלעדיו Convex מסרב לפרוס. לא בשימוש, ומתנקה בשינוי תפקיד.
    teenRequested: v.optional(v.boolean()),
  })
    .index("by_family", ["familyId"])
    .index("by_friendEmail", ["friendEmail"]),

  // בקשות הצטרפות שממתינות לאישור הורה. רק אחרי האישור נוצר אדם במשפחה (עם הקוד הסודי שבחר/ה).
  joinRequests: defineTable({
    familyId: v.id("families"),
    name: v.string(),
    avatar: v.optional(v.string()),
    device: v.optional(v.string()),
    pinHash: v.string(),
    pinSalt: v.string(),
    createdAt: v.number(),
  }).index("by_family", ["familyId"]),

  sessions: defineTable({
    personId: v.id("people"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_person", ["personId"])
    .index("by_expires", ["expiresAt"]),

  // קודי אימות חד-פעמיים שנשלחים למייל (נשמרים כגיבוב בלבד).
  emailCodes: defineTable({
    personId: v.id("people"),
    email: v.string(),
    purpose: v.union(v.literal("verify"), v.literal("pinChange"), v.literal("pinReset"), v.literal("childReset"), v.literal("emailChange")),
    codeHash: v.string(),
    salt: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_expires", ["expiresAt"]),

  entries: defineTable({
    familyId: v.optional(v.id("families")),
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(), // במאיות של המטבע (אגורות, סנטים...)
    // מטבע הרשומה (ILS, USD...). חסר = שקלים (רשומות מלפני המטבעות).
    currency: v.optional(v.string()),
    // בהחזר: השערים ברגע התשלום (יחידות לדולר), כדי שהמרת ההחזר לחוב במטבע אחר לא תשתנה בדיעבד.
    fx: v.optional(v.record(v.string(), v.number())),
    note: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdBy: v.optional(v.id("people")),
    createdAt: v.optional(v.number()),
    // החזר שקשור לחוב מסוים (debtId = רשומת החוב). חסר = החזר כללי. החוב נשאר פתוח עד שסכום ההחזרים מגיע לסכום החוב.
    debtId: v.optional(v.id("entries")),
    // רשומה שילד/ה יצר/ה ממתינה לאישור הורה ולא נספרת ביתרות. חסר = מאושר.
    status: v.optional(v.literal("pending")),
    // החובות וההחזרים של הכיוון הזה (from → to) נסגרו לגמרי, ולכן אין להם יותר השפעה על יתרות.
    // הם נשארים בהיסטוריה אבל לא נשלחים עם הנתונים הראשיים. ראו ledger.ts.
    archived: v.optional(v.literal(true)),
  })
    .index("by_family", ["familyId"])
    .index("by_family_active", ["familyId", "archived"])
    .index("by_from", ["from"])
    .index("by_to", ["to"])
    .index("by_from_to", ["from", "to"])
    .index("by_pair", ["from", "to", "archived"])
    .index("by_debt", ["debtId"]),

  // חברות בין בני נוער (גם ממשפחות שונות). a ביקש/ה, b צריך/ה לאשר.
  friendships: defineTable({
    a: v.id("people"),
    b: v.id("people"),
    status: v.union(v.literal("pending"), v.literal("accepted")),
    createdAt: v.number(),
  })
    .index("by_a", ["a"])
    .index("by_b", ["b"]),

  // חובות והחזרים בין חברים. רשומה חדשה ממתינה לאישור של החבר/ה השני/ה ולא נספרת ביתרות.
  friendEntries: defineTable({
    kind: v.union(v.literal("debt"), v.literal("payment")),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(), // באגורות
    note: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdBy: v.id("people"),
    createdAt: v.number(),
    status: v.optional(v.literal("pending")),
    // החזר שקשור לחוב מסוים בין חברים (debtId = רשומת החוב). חסר = החזר כללי.
    debtId: v.optional(v.id("friendEntries")),
  })
    .index("by_from", ["from"])
    .index("by_to", ["to"]),

  // מנויי התראות (Web Push), מכשיר אחד = שורה אחת.
  pushSubs: defineTable({
    personId: v.id("people"),
    familyId: v.id("families"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_endpoint", ["endpoint"]),

  // רישום חוזר (דמי כיס). רץ אוטומטית פעם ביום ויוצר חוב חדש בתאריך המתאים.
  recurring: defineTable({
    familyId: v.id("families"),
    from: v.id("people"),
    to: v.id("people"),
    amount: v.number(), // באגורות
    currency: v.optional(v.string()), // חסר = שקלים
    note: v.string(),
    frequency: v.union(v.literal("weekly"), v.literal("monthly")),
    weekday: v.optional(v.number()), // 0 = ראשון
    monthDay: v.optional(v.number()), // 1-28
    nextDate: v.string(), // YYYY-MM-DD, הרישום הבא
    createdBy: v.id("people"),
    createdAt: v.number(),
  })
    .index("by_family", ["familyId"])
    .index("by_nextDate", ["nextDate"]),

  // מכשירים שהורה רשם לאימות ביומטרי (WebAuthn באתר, Android Keystore באפליקציה).
  bioKeys: defineTable({
    personId: v.id("people"),
    kind: v.union(v.literal("webauthn"), v.literal("android")),
    credentialId: v.string(),
    publicKey: v.string(), // SPKI ב-base64
    alg: v.number(), // COSE: -7 = ES256, -257 = RS256
    origin: v.optional(v.string()),
    label: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  }).index("by_person", ["personId"]),

  // אתגרים חד-פעמיים לאימות ביומטרי, קשורים לפעולה מסוימת.
  bioChallenges: defineTable({
    personId: v.id("people"),
    action: v.string(),
    challenge: v.string(),
    expiresAt: v.number(),
  }).index("by_person", ["personId"]),

  // שערי חליפין עדכניים (מסמך אחד). rates[X] = כמה X שווה דולר אחד.
  fxRates: defineTable({
    rates: v.record(v.string(), v.number()),
    source: v.string(),
    fetchedAt: v.number(),
  }),

  // מונים גסים להגבלת קצב (ניחוש קודי משפחה, יצירת משפחות).
  throttles: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_window", ["windowStart"]),
});
