/* =======================================================
   Client-side auth (DEMO ONLY).
   Users and sessions live in localStorage so this project runs
   with zero backend. This is NOT secure — do not reuse this
   pattern, or a real password, in production. A real build
   would hash+salt server-side (e.g. bcrypt) and issue a signed
   session token (e.g. JWT) from an API instead.
   ======================================================= */

const AUTH_USERS_KEY = "mic_users";
const AUTH_SESSION_KEY = "mic_session";

// Small non-cryptographic hash — good enough to avoid storing
// plaintext passwords in a demo, not good enough for real security.
function demoHash(str){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++){
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function getUsers(){
  try{ return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || []; }
  catch(e){ return []; }
}
function saveUsers(users){
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function getSession(){
  try{ return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); }
  catch(e){ return null; }
}
function setSession(session){
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}
function clearSession(){
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

/**
 * Creates a new account.
 * @returns {{ok:true}|{ok:false, field:string, message:string}}
 */
function signup({name, email, password}){
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();

  if(!name.trim()) return {ok:false, field:"name", message:"Enter your name."};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return {ok:false, field:"email", message:"Enter a valid email address."};
  if(users.some(u => u.email === normalizedEmail))
    return {ok:false, field:"email", message:"An account with this email already exists."};
  if(password.length < 8)
    return {ok:false, field:"password", message:"Password must be at least 8 characters."};

  users.push({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: demoHash(password),
    createdAt: new Date().toISOString(),
  });
  saveUsers(users);
  setSession({name: name.trim(), email: normalizedEmail, loginAt: new Date().toISOString()});
  return {ok:true};
}

/**
 * Logs an existing user in.
 * @returns {{ok:true}|{ok:false, field:string, message:string}}
 */
function login({email, password}){
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find(u => u.email === normalizedEmail);

  if(!user) return {ok:false, field:"email", message:"No account found with this email."};
  if(user.passwordHash !== demoHash(password))
    return {ok:false, field:"password", message:"Incorrect password."};

  setSession({name: user.name, email: user.email, loginAt: new Date().toISOString()});
  return {ok:true};
}

function logout(){
  clearSession();
  window.location.href = "login.html";
}

/** Redirects to login if there's no active session. Call at the top of protected pages. */
function requireAuth(){
  const session = getSession();
  if(!session){
    window.location.href = "login.html";
    return null;
  }
  return session;
}

/** Redirects away from auth pages if the user is already signed in. */
function redirectIfAuthed(){
  if(getSession()){
    window.location.href = "index.html";
  }
}

function initials(name){
  return name.trim().split(/\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase();
}
