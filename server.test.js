const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {after, before, test} = require("node:test");
const {createServer} = require("./server");

let server;
let baseUrl;
let dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pharmasense-test-"));
  server = createServer({dataDir});
  await server.ready;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if(server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if(dataDir) await fs.rm(dataDir, {recursive: true, force: true});
});

async function postJson(route, body, cookie){
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? {Cookie: cookie} : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response){
  return response.headers.get("set-cookie").split(";")[0];
}

test("serves the app and reports API health", async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Sign in to check your medicines/);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), {ok: true});
});

test("signs up, protects history, and persists account checks", async () => {
  const signup = await postJson("/api/auth/signup", {
    name: "Test User",
    email: "TEST@example.com",
    password: "passphrase-123",
  });
  assert.equal(signup.status, 201);
  const cookie = sessionCookie(signup);
  assert.match(signup.headers.get("set-cookie"), /HttpOnly/);
  assert.deepEqual((await signup.json()).user, {name: "Test User", email: "test@example.com"});
  const savedStore = JSON.parse(await fs.readFile(path.join(dataDir, "store.json"), "utf8"));
  assert.notEqual(savedStore.users[0].passwordHash, "passphrase-123");
  assert.equal(JSON.stringify(savedStore).includes("passphrase-123"), false);

  const login = await postJson("/api/auth/login", {
    email: "test@example.com",
    password: "passphrase-123",
  });
  assert.equal(login.status, 200);
  assert.deepEqual((await login.json()).user, {name: "Test User", email: "test@example.com"});

  const unauthorized = await fetch(`${baseUrl}/api/history`);
  assert.equal(unauthorized.status, 401);

  const saved = await postJson("/api/history", {
    meds: ["Warfarin", "Aspirin"],
    findingsCount: 1,
    worstSeverity: "danger",
  }, cookie);
  assert.equal(saved.status, 201);
  const savedBody = await saved.json();
  assert.equal(savedBody.totalChecks, 1);
  assert.deepEqual(savedBody.items[0].meds, ["Warfarin", "Aspirin"]);
  assert.equal("userId" in savedBody.items[0], false);

  const history = await fetch(`${baseUrl}/api/history`, {headers: {Cookie: cookie}});
  const historyBody = await history.json();
  assert.equal(historyBody.totalChecks, 1);
  assert.equal(historyBody.items.length, 1);

  const duplicate = await postJson("/api/auth/signup", {
    name: "Other",
    email: "test@example.com",
    password: "passphrase-123",
  });
  assert.equal(duplicate.status, 409);

  const logout = await postJson("/api/auth/logout", {}, cookie);
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(`${baseUrl}/api/history`, {headers: {Cookie: cookie}});
  assert.equal(afterLogout.status, 401);
});

test("validates credentials and does not expose whether an account exists", async () => {
  const badSignup = await postJson("/api/auth/signup", {
    name: "",
    email: "not-an-email",
    password: "short",
  });
  assert.equal(badSignup.status, 400);
  assert.equal((await badSignup.json()).field, "name");

  const badLogin = await postJson("/api/auth/login", {
    email: "missing@example.com",
    password: "passphrase-123",
  });
  assert.equal(badLogin.status, 401);
  assert.equal((await badLogin.json()).message, "Email or password is incorrect.");
});
