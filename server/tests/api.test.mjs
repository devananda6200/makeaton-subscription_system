import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { openDatabase } from "../db.mjs";
import { createApp } from "../app.mjs";
import { initializeData } from "../seed.mjs";
import { today } from "../domain.mjs";

test("API enforces roles, tenant isolation, origin checks and single-use reset links", async (t) => {
  const db = openDatabase(":memory:");
  await initializeData(db, true);
  const server = createApp(db, { demo: true }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = "GET", body, cookie, extra = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  assert.equal((await request("/subscriptions")).status, 401);
  const login = async (role) =>
    request("/auth/login", "POST", {
      email: `${role}@brightloop.demo`,
      password: "LoopDemo!2026",
    });
  const admin = (await login("admin")).cookie,
    staff = (await login("staff")).cookie,
    customer = (await login("customer")).cookie;
  assert.ok(admin && staff && customer);
  assert.equal(
    (
      await request(
        "/staff",
        "POST",
        { name: "Not allowed", email: "s@example.com", password: "ValidPass!" },
        staff,
      )
    ).status,
    403,
  );
  assert.equal((await request("/discounts", "POST", {}, staff)).status, 403);
  assert.equal(
    (await request("/customers", "GET", undefined, customer)).status,
    403,
  );
  assert.equal(
    (await request("/outbox", "GET", undefined, customer)).status,
    403,
  );
  assert.equal(
    (await request("/invoices/2", "GET", undefined, customer)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/subscriptions/2/action",
        "POST",
        { action: "close" },
        customer,
      )
    ).status,
    404,
  );
  const portal = await request("/subscriptions", "GET", undefined, customer);
  assert.ok(portal.data.items.length > 0);
  assert.ok(portal.data.items.every((r) => r.customer_id === 1));
  assert.equal(
    (
      await request("/billing/run", "POST", {}, admin, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/register", "POST", {
        name: "Intruder",
        email: "hello2@example.com",
        password: "ValidPass!",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/auth/register", "POST", {
        name: "New user",
        email: "NEW@example.com",
        password: "ValidPass!",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request("/auth/register", "POST", {
        name: "Duplicate",
        email: "new@example.com",
        password: "ValidPass!",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/auth/forgot", "POST", {
        email: "customer@brightloop.demo",
      })
    ).status,
    200,
  );
  const publicOutbox = await request("/outbox", "GET", undefined, admin);
  assert.equal(publicOutbox.status, 200);
  assert.ok(publicOutbox.data.items.every(mail => !mail.body.includes("?reset=")));
  const outbox = db
    .prepare("SELECT body FROM outbox ORDER BY id DESC LIMIT 1")
    .get();
  const token = outbox.body.match(/reset=([a-f0-9]{64})/)[1];
  assert.equal(
    (await request("/auth/reset", "POST", { token, password: "ChangedPass!" }))
      .status,
    200,
  );
  assert.equal(
    (await request("/auth/reset", "POST", { token, password: "AnotherPass!" }))
      .status,
    400,
  );
  assert.equal(
    (await request("/subscriptions", "GET", undefined, customer)).status,
    401,
  );
  const r = await request(
    `/reports?from=${today()}&to=${today()}`,
    "GET",
    undefined,
    admin,
  );
  assert.equal(r.status, 200);
  assert.ok(Number.isInteger(r.data.mrr));
});
