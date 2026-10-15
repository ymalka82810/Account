import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ניקוי יומי של כניסות שפג תוקפן ומוני הגבלת קצב ישנים.
crons.daily("cleanup expired data", { hourUTC: 1, minuteUTC: 0 }, internal.maintenance.cleanup);

// דמי כיס קבועים: כל בוקר (בערך 05:30-06:30 שעון ישראל).
crons.daily("recurring entries", { hourUTC: 3, minuteUTC: 30 }, internal.recurring.runDue);

// תזכורת להורים על חובות פתוחים: בימי ראשון בבוקר (בערך 08:00-09:00 שעון ישראל).
crons.weekly("open debt reminders", { dayOfWeek: "sunday", hourUTC: 6, minuteUTC: 0 }, internal.reminders.weekly);

// שערי חליפין: עדכון כל 3 שעות (הספק החינמי מתעדכן בערך פעם ביום).
crons.interval("exchange rates", { hours: 3 }, internal.fx.refresh);

export default crons;
