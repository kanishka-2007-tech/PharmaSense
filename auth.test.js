const assert = require("node:assert/strict");
const {test} = require("node:test");
const {webcrypto} = require("node:crypto");
const {
  apiRequest,
  clearSession,
  getAccountMode,
  getSession,
  login,
  signup,
} = require("./js/auth");

test("falls back to a browser-only demo account when Vercel has no API route", async () => {
  const savedFetch = global.fetch;
  const savedCrypto = global.crypto;
  const savedLocalStorage = global.localStorage;
  const storage = new Map();
  global.crypto = webcrypto;
  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  global.fetch = async () => new Response("Not Found", {status: 404});

  try{
    const created = await signup({
      name: "Demo User",
      email: "DEMO@example.com",
      password: "example-passphrase",
    });
    assert.deepEqual(created, {ok: true, localOnly: true});
    assert.equal(getAccountMode(), "local");
    assert.deepEqual(getSession(), {name: "Demo User", email: "demo@example.com"});
    assert.equal(JSON.stringify([...storage.values()]).includes("example-passphrase"), false);

    const emptyHistory = await apiRequest("/history");
    assert.deepEqual(emptyHistory, {items: [], totalChecks: 0});
    const savedHistory = await apiRequest("/history", {
      method: "POST",
      body: {meds: ["Aspirin", "Warfarin"], findingsCount: 1, worstSeverity: "danger"},
    });
    assert.equal(savedHistory.totalChecks, 1);
    assert.deepEqual(savedHistory.items[0].meds, ["Aspirin", "Warfarin"]);

    clearSession();
    const signedIn = await login({email: "demo@example.com", password: "example-passphrase"});
    assert.deepEqual(signedIn, {ok: true, localOnly: true});
    const rejected = await login({email: "demo@example.com", password: "wrong-passphrase"});
    assert.equal(rejected.ok, false);
    assert.equal(rejected.field, "password");
  } finally{
    global.fetch = savedFetch;
    global.crypto = savedCrypto;
    global.localStorage = savedLocalStorage;
  }
});

test("falls back when the deployed API returns an internal server error", async () => {
  const savedFetch = global.fetch;
  const savedCrypto = global.crypto;
  const savedLocalStorage = global.localStorage;
  const storage = new Map();
  global.crypto = webcrypto;
  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  global.fetch = async () => new Response("Internal Server Error", {status: 500});

  try{
    const created = await signup({
      name: "Demo User",
      email: "demo@example.com",
      password: "example-passphrase",
    });
    assert.deepEqual(created, {ok: true, localOnly: true});
    clearSession();
    const signedIn = await login({email: "demo@example.com", password: "example-passphrase"});
    assert.deepEqual(signedIn, {ok: true, localOnly: true});
  } finally{
    global.fetch = savedFetch;
    global.crypto = savedCrypto;
    global.localStorage = savedLocalStorage;
  }
});
