import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ניקוי יומי של כניסות שפג תוקפן ומוני הגבלת קצב ישנים.
crons.daily("cleanup expired data", { hourUTC: 1, minuteUTC: 0 }, internal.maintenance.cleanup);

export default crons;
