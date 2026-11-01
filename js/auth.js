const AUTH_SESSION_KEY = "ps_session";
const AUTH_LAST_EMAIL_KEY = "ps_last_email";

async function apiRequest(path, {method = "GET", body} = {}){
  let response;
  try{
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : {"Content-Type": "application/json"},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch(error){
    throw new Error("Cannot reach the PharmaSense server. Start it with `npm start` and try again.");
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

function getSession(){
  try{
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)) || null;
  } catch(error){
    console.error("Could not read the saved account profile.", error);
    return null;
  }
}
function setSession(session){
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(AUTH_LAST_EMAIL_KEY, session.email);
}
function getLastLoginEmail(){
  return localStorage.getItem(AUTH_LAST_EMAIL_KEY) || "";
}
function clearSession(){
  localStorage.removeItem(AUTH_SESSION_KEY);
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
    if(error.field) return {ok: false, field: error.field, message: error.message};
    throw error;
  }
}

async function login({email, password}){
  try{
    const {user} = await apiRequest("/auth/login", {
      method: "POST",
      body: {email, password},
    });
    setSession(user);
    return {ok: true};
  } catch(error){
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
