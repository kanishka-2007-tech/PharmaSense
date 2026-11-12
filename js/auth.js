const AUTH_SESSION_KEY = "ps_session";
const AUTH_LAST_EMAIL_KEY = "ps_last_email";
const AUTH_MODE_KEY = "ps_auth_mode";
const LOCAL_USERS_KEY = "ps_local_users";

function getAccountMode(){
  return localStorage.getItem(AUTH_MODE_KEY);
}

function setSession(session, mode = getAccountMode() || "server"){
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(AUTH_LAST_EMAIL_KEY, session.email);
  localStorage.setItem(AUTH_MODE_KEY, mode);
}

function getLocalUsers(){
  try{
    const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]");
    if(!Array.isArray(users)) throw new Error("Saved local accounts have an invalid format.");
    return users;
  } catch(error){
    console.error("Could not read local demo accounts.", error);
    throw new Error("Saved local accounts could not be read. Clear this site's browser data and try again.");
  }
}

function validateLocalCredentials({name, email, password}, needsName){
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanPassword = typeof password === "string" ? password : "";
  if(needsName && (!cleanName || cleanName.length > 100)){
    return {error: "Enter a name between 1 and 100 characters.", field: "name"};
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254){
    return {error: "Enter a valid email address.", field: "email"};
  }
  if(cleanPassword.length < 8 || new TextEncoder().encode(cleanPassword).length > 1024){
    return {error: "Password must be at least 8 characters.", field: "password"};
  }
  return {name: cleanName, email: cleanEmail, password: cleanPassword};
}

async function hashLocalPassword(password, salt){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: 120000,
    hash: "SHA-256",
  }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function localSignup(input){
  const credentials = validateLocalCredentials(input, true);
  if(credentials.error) return {ok: false, field: credentials.field, message: credentials.error};

  const users = getLocalUsers();
  if(users.some(user => user.email === credentials.email)){
    return {ok: false, field: "email", message: "An account with this email already exists in this browser."};
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashLocalPassword(credentials.password, salt);
  users.push({
    name: credentials.name,
    email: credentials.email,
    salt: Array.from(salt),
    passwordHash,
  });
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  setSession({name: credentials.name, email: credentials.email}, "local");
  return {ok: true, localOnly: true};
}

async function localLogin(input){
  const credentials = validateLocalCredentials(input, false);
  if(credentials.error) return {ok: false, field: credentials.field, message: credentials.error};
  const user = getLocalUsers().find(item => item.email === credentials.email);
  if(!user){
    return {ok: false, field: "email", message: "No local account exists for this email. Create an account on this browser first."};
  }
  const passwordHash = await hashLocalPassword(credentials.password, new Uint8Array(user.salt));
  if(passwordHash !== user.passwordHash){
    return {ok: false, field: "password", message: "Email or password is incorrect."};
  }
  setSession({name: user.name, email: user.email}, "local");
  return {ok: true, localOnly: true};
}

async function localApiRequest(path, {method = "GET", body} = {}){
  const session = getSession();
  if(path === "/auth/logout" && method === "POST") return {ok: true};
  if(path === "/auth/session" && method === "GET"){
    if(!session) throw Object.assign(new Error("Sign in to continue."), {status: 401});
    return {user: session};
  }
  if(path === "/history" && (method === "GET" || method === "POST")){
    if(!session) throw Object.assign(new Error("Sign in to continue."), {status: 401});
    const historyKey = `ps_history_${session.email}`;
    const countKey = `ps_check_count_${session.email}`;
    const items = JSON.parse(localStorage.getItem(historyKey) || "[]");
    const totalChecks = Number(localStorage.getItem(countKey) || items.length);
    if(method === "GET") return {items, totalChecks};

    if(!Array.isArray(body.meds) || body.meds.length < 2 || body.meds.length > 12
      || body.meds.some(medicine => typeof medicine !== "string" || !medicine.trim() || medicine.length > 120)){
      throw Object.assign(new Error("A check must contain between 2 and 12 valid medicine names."), {status: 400});
    }
    if(!Number.isInteger(body.findingsCount) || body.findingsCount < 0 || body.findingsCount > 100){
      throw Object.assign(new Error("The findings count is invalid."), {status: 400});
    }
    if(!["danger", "caution", "safe"].includes(body.worstSeverity)){
      throw Object.assign(new Error("The result severity is invalid."), {status: 400});
    }
    const updatedItems = [{
      meds: body.meds.map(medicine => medicine.trim()),
      findingsCount: body.findingsCount,
      worstSeverity: body.worstSeverity,
      at: new Date().toISOString(),
    }, ...items].slice(0, 8);
    localStorage.setItem(historyKey, JSON.stringify(updatedItems));
    localStorage.setItem(countKey, String(totalChecks + 1));
    return {items: updatedItems, totalChecks: totalChecks + 1};
  }
  throw Object.assign(new Error("API route not found."), {status: 404});
}

async function apiRequest(path, {method = "GET", body} = {}){
  if(getAccountMode() === "local") return localApiRequest(path, {method, body});
  let response;
  try{
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : {"Content-Type": "application/json"},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch(error){
    throw Object.assign(new Error("Cannot reach the PharmaSense server."), {status: 0});
  }

  const result = await response.json().catch(() => ({}));
  if(!response.ok){
    const error = new Error(result.message || "The request could not be completed.");
    error.status = response.status;
    error.field = result.field;
    throw error;
  }
  return result;
}

function shouldUseLocalFallback(error){
  // A deployed static demo can return a plain 500 page when its API function
  // is unavailable. Treat all server-side failures like the other unavailable
  // API statuses so sign-in can still use the browser-only demo account.
  return !error.status || error.status >= 500;
}

function getSession(){
  try{
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)) || null;
  } catch(error){
    console.error("Could not read the saved account profile.", error);
    return null;
  }
}
function getLastLoginEmail(){
  return localStorage.getItem(AUTH_LAST_EMAIL_KEY) || "";
}
function clearSession(){
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
}

async function signup({name, email, password}){
  try{
    const {user} = await apiRequest("/auth/signup", {
      method: "POST",
      body: {name, email, password},
    });
    setSession(user);
    return {ok: true};
  } catch(error){
    if(shouldUseLocalFallback(error) || error.status === 404){
      return localSignup({name, email, password});
    }
    if(error.field) return {ok: false, field: error.field, message: error.message};
    throw error;
  }
}

async function login({email, password}){
  if(getAccountMode() === "local") return localLogin({email, password});
  try{
    const {user} = await apiRequest("/auth/login", {
      method: "POST",
      body: {email, password},
    });
    setSession(user);
    return {ok: true};
  } catch(error){
    if(shouldUseLocalFallback(error) || error.status === 404){
      return localLogin({email, password});
    }
    if(error.field) return {ok: false, field: error.field, message: error.message};
    throw error;
  }
}

async function logout(){
  try{
    await apiRequest("/auth/logout", {method: "POST"});
  } catch(error){
    console.error("Could not end the server session.", error);
  } finally{
    clearSession();
    window.location.href = "login.html";
  }
}

function requireAuth(){
  const session = getSession();
  if(!session){
    window.location.href = "login.html";
    return null;
  }
  return session;
}

async function redirectIfAuthed(){
  if(getAccountMode() === "local"){
    if(getSession()) window.location.href = "index.html";
    return;
  }
  try{
    const {user} = await apiRequest("/auth/session");
    setSession(user);
    window.location.href = "index.html";
  } catch(error){
    if(error.status === 401){
      clearSession();
      return;
    }
    console.error("Could not verify the saved server session.", error);
  }
}

function initials(name){
  return name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

if(typeof module !== "undefined" && module.exports){
  module.exports = {apiRequest, clearSession, getAccountMode, getLastLoginEmail, getSession, login, logout, redirectIfAuthed, setSession, signup};
}
