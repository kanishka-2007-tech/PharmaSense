const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const SESSION_COOKIE = "pharmasense_session";
const MAX_BODY_BYTES = 16 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function loadEnvironment(){
  const envPath = path.join(ROOT, ".env");
  try{
    const lines = require("node:fs").readFileSync(envPath, "utf8").split(/\r?\n/);
    for(const line of lines){
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if(!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch(error){
    if(error.code !== "ENOENT") throw error;
  }
}

loadEnvironment();

const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || "data"),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 7),
};

function sendJson(response, status, value, headers = {}){
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function sendError(response, status, message, field){
  sendJson(response, status, field ? {message, field} : {message});
}

function cookieValue(request, name){
  const cookies = (request.headers.cookie || "").split(";");
  for(const cookie of cookies){
    const separator = cookie.indexOf("=");
    if(separator < 0) continue;
    if(cookie.slice(0, separator).trim() === name){
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }
  return null;
}

function sessionCookie(value, maxAge){
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

async function readJson(request){
  const chunks = [];
  let size = 0;
  for await (const chunk of request){
    size += chunk.length;
    if(size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), {status: 413});
    chunks.push(chunk);
  }
  try{
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch(error){
    throw Object.assign(new Error("Request body must be valid JSON."), {status: 400});
  }
}

function validateCredentials(body, needsName){
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if(needsName && (!name || name.length > 100)){
    return {error: "Enter a name between 1 and 100 characters.", field: "name"};
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254){
    return {error: "Enter a valid email address.", field: "email"};
  }
  if(password.length < 8 || Buffer.byteLength(password, "utf8") > 1024){
    return {error: "Password must be at least 8 characters.", field: "password"};
  }
  return {name, email, password};
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")){
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return {salt, hash};
}

function verifyPassword(password, user){
  const candidate = crypto.scryptSync(password, user.salt, 64);
  const saved = Buffer.from(user.passwordHash, "hex");
  return candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved);
}

function publicUser(user){
  return {name: user.name, email: user.email};
}

function createServer({dataDir = config.dataDir} = {}){
  const storePath = path.join(dataDir, "store.json");
  let store;
  let writeQueue = Promise.resolve();

  async function loadStore(){
    await fs.mkdir(dataDir, {recursive: true});
    try{
      store = JSON.parse(await fs.readFile(storePath, "utf8"));
      if(!store || !Array.isArray(store.users) || !Array.isArray(store.sessions) || !Array.isArray(store.history)){
        throw new Error("The data store has an invalid structure.");
      }
    } catch(error){
      if(error.code !== "ENOENT") throw error;
      store = {users: [], sessions: [], history: []};
      await persistStore();
    }
  }

  function persistStore(){
    const snapshot = JSON.stringify(store, null, 2);
    writeQueue = writeQueue.then(async () => {
      const tempPath = `${storePath}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tempPath, snapshot, {encoding: "utf8", mode: 0o600});
      await fs.rename(tempPath, storePath);
    });
    return writeQueue;
  }

  function findSession(request){
    const id = cookieValue(request, SESSION_COOKIE);
    if(!id) return null;
    const session = store.sessions.find(item => item.id === id && item.expiresAt > Date.now());
    if(!session) return null;
    const user = store.users.find(item => item.id === session.userId);
    return user ? {session, user} : null;
  }

  async function handleApi(request, response, url){
    if(request.method === "GET" && url.pathname === "/api/health"){
      return sendJson(response, 200, {ok: true});
    }

    if(request.method === "POST" && url.pathname === "/api/auth/signup"){
      const body = await readJson(request);
      const credentials = validateCredentials(body, true);
      if(credentials.error) return sendError(response, 400, credentials.error, credentials.field);
      if(store.users.some(user => user.email === credentials.email)){
        return sendError(response, 409, "An account with this email already exists.", "email");
      }
      const password = hashPassword(credentials.password);
      const user = {
        id: crypto.randomUUID(),
        name: credentials.name,
        email: credentials.email,
        salt: password.salt,
        passwordHash: password.hash,
        createdAt: new Date().toISOString(),
      };
      const sessionId = crypto.randomBytes(32).toString("hex");
      store.users.push(user);
      store.sessions.push({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + config.sessionTtlDays * 86400000,
      });
      await persistStore();
      return sendJson(response, 201, {user: publicUser(user)}, {
        "Set-Cookie": sessionCookie(sessionId, config.sessionTtlDays * 86400),
      });
    }

    if(request.method === "POST" && url.pathname === "/api/auth/login"){
      const body = await readJson(request);
      const credentials = validateCredentials(body, false);
      if(credentials.error) return sendError(response, 400, credentials.error, credentials.field);
      const user = store.users.find(item => item.email === credentials.email);
      if(!user || !verifyPassword(credentials.password, user)){
        return sendError(response, 401, "Email or password is incorrect.", "password");
      }
      const sessionId = crypto.randomBytes(32).toString("hex");
      store.sessions = store.sessions.filter(item => item.expiresAt > Date.now());
      store.sessions.push({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + config.sessionTtlDays * 86400000,
      });
      await persistStore();
      return sendJson(response, 200, {user: publicUser(user)}, {
        "Set-Cookie": sessionCookie(sessionId, config.sessionTtlDays * 86400),
      });
    }

    if(request.method === "POST" && url.pathname === "/api/auth/logout"){
      const id = cookieValue(request, SESSION_COOKIE);
      if(id){
        store.sessions = store.sessions.filter(item => item.id !== id);
        await persistStore();
      }
      return sendJson(response, 200, {ok: true}, {
        "Set-Cookie": sessionCookie("", 0),
      });
    }

    if(request.method === "GET" && url.pathname === "/api/auth/session"){
      const authenticated = findSession(request);
      if(!authenticated) return sendError(response, 401, "Sign in to continue.");
      return sendJson(response, 200, {user: publicUser(authenticated.user)});
    }

    if(url.pathname === "/api/history" && (request.method === "GET" || request.method === "POST")){
      const authenticated = findSession(request);
      if(!authenticated) return sendError(response, 401, "Sign in to continue.");
      const userHistory = store.history.filter(item => item.userId === authenticated.user.id);
      if(request.method === "GET"){
        const totalChecks = store.users.find(user => user.id === authenticated.user.id).totalChecks || 0;
        return sendJson(response, 200, {
          items: userHistory.slice(0, 8).map(({userId, ...entry}) => entry),
          totalChecks,
        });
      }
      const body = await readJson(request);
      if(!Array.isArray(body.meds) || body.meds.length < 2 || body.meds.length > 12
        || body.meds.some(medicine => typeof medicine !== "string" || !medicine.trim() || medicine.length > 120)){
        return sendError(response, 400, "A check must contain between 2 and 12 valid medicine names.");
      }
      if(!Number.isInteger(body.findingsCount) || body.findingsCount < 0 || body.findingsCount > 100){
        return sendError(response, 400, "The findings count is invalid.");
      }
      if(!["danger", "caution", "safe"].includes(body.worstSeverity)){
        return sendError(response, 400, "The result severity is invalid.");
      }
      const entry = {
        userId: authenticated.user.id,
        meds: body.meds.map(medicine => medicine.trim()),
        findingsCount: body.findingsCount,
        worstSeverity: body.worstSeverity,
        at: new Date().toISOString(),
      };
      store.history = [entry, ...userHistory].slice(0, 8).concat(
        store.history.filter(item => item.userId !== authenticated.user.id)
      );
      const user = store.users.find(item => item.id === authenticated.user.id);
      user.totalChecks = (user.totalChecks || 0) + 1;
      await persistStore();
      return sendJson(response, 201, {
        items: store.history.filter(item => item.userId === user.id).slice(0, 8)
          .map(({userId, ...savedEntry}) => savedEntry),
        totalChecks: user.totalChecks,
      });
    }

    return sendError(response, 404, "API route not found.");
  }

  const server = http.createServer(async (request, response) => {
    try{
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if(url.pathname.startsWith("/api/")){
        await handleApi(request, response, url);
        return;
      }
      if(request.method !== "GET" && request.method !== "HEAD"){
        return sendError(response, 405, "Method not allowed.");
      }
      const requestedPath = decodeURIComponent(url.pathname === "/" ? "/login.html" : url.pathname);
      const filePath = path.resolve(ROOT, `.${requestedPath}`);
      if(!filePath.startsWith(`${ROOT}${path.sep}`)){
        return sendError(response, 404, "Page not found.");
      }
      let contents;
      try{
        contents = await fs.readFile(filePath);
      } catch(error){
        if(error.code === "ENOENT" || error.code === "EISDIR"){
          return sendError(response, 404, "Page not found.");
        }
        throw error;
      }
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": [".html", ".js"].includes(path.extname(filePath))
          ? "no-cache" : "public, max-age=3600",
      });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch(error){
      console.error("Request failed:", error);
      if(!response.headersSent){
        sendError(response, error.status || 500, error.status ? error.message : "The server could not complete the request.");
      } else {
        response.destroy(error);
      }
    }
  });

  server.ready = loadStore();
  return server;
}

if(require.main === module){
  if(!Number.isInteger(config.port) || config.port < 0 || config.port > 65535){
    throw new Error("PORT must be a valid port number.");
  }
  if(!Number.isInteger(config.sessionTtlDays) || config.sessionTtlDays < 1 || config.sessionTtlDays > 365){
    throw new Error("SESSION_TTL_DAYS must be between 1 and 365.");
  }
  const server = createServer();
  server.ready.then(() => {
    server.listen(config.port, config.host, () => {
      const address = server.address();
      console.log(`PharmaSense is running at http://${config.host}:${address.port}`);
      console.log(`Local account data: ${config.dataDir}`);
    });
  }).catch(error => {
    console.error("Could not initialize the PharmaSense data store:", error);
    process.exitCode = 1;
  });
}

module.exports = {createServer};
