import { openDatabase } from "./db.mjs";
import { initializeData } from "./seed.mjs";
import { createApp } from "./app.mjs";
import { runBilling } from "./billing.mjs";
import { deliverOutbox } from "./mail.mjs";

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
const timer = setInterval(
  () => {
    try {
      runBilling(db);
      void deliverOutbox(db);
    } catch (error) {
      console.error("Scheduled billing failed:", error.message);
    }
  },
  60 * 60 * 1000,
);
timer.unref();
void deliverOutbox(db);
function stop() {
  clearInterval(timer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
