import { openDatabase } from "./db.mjs";
import { initializeData } from "./seed.mjs";
import { createApp } from "./app.mjs";
import { runBilling } from "./billing.mjs";
import { deliverOutbox } from "./mail.mjs";
import { setImmediate as yieldToRequests } from "node:timers/promises";

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
if (!demo) scheduleBilling();
void deliverOutbox(db);
function stop() {
  stopping = true;
  clearInterval(timer);
  server.close(async () => {
    if (billingJob) await billingJob;
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
