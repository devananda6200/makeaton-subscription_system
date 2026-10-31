import { openDatabase } from "./db.mjs";
import { initializeData } from "./seed.mjs";
import { createApp } from "./app.mjs";
import { runBilling } from "./billing.mjs";
import { deliverOutbox } from "./mail.mjs";
import { setImmediate as yieldToRequests } from "node:timers/promises";

// Render assigns the public URL after service creation. Keep a custom APP_URL
// authoritative, otherwise use the platform URL for origin checks and email links.
if (!process.env.APP_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.APP_URL = process.env.RENDER_EXTERNAL_URL;
}

const db = openDatabase();
const requestedDemo =
  process.env.DEMO_MODE === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "false");
const demo = await initializeData(db, requestedDemo);
const app = createApp(db, { demo });
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Brightloop ready at http://localhost:${port}${demo ? " (fictional demo workspace)" : ""}`,
  ),
);
// One process owns scheduling. Transactions + the cycle key also protect manual runs.
let stopping = false;
let billingJob = null;
function scheduleBilling() {
  if (billingJob || stopping) return;
  billingJob = (async () => {
    try {
      let remaining;
      do {
        remaining = runBilling(db).remaining;
        await yieldToRequests();
      } while (remaining && !stopping);
      await deliverOutbox(db);
    } catch (error) {
      console.error("Scheduled billing failed:", error.message);
    } finally {
      billingJob = null;
    }
  })();
}
const timer = setInterval(scheduleBilling, 60 * 60 * 1000);
timer.unref();
scheduleBilling();
void deliverOutbox(db);
const emailTimer = setInterval(() => void deliverOutbox(db), 60000);
emailTimer.unref();
function stop() {
  stopping = true;
  clearInterval(timer);
  clearInterval(emailTimer);
  server.close(async () => {
    if (billingJob) await billingJob;
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
