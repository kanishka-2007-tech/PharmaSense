/* =======================================================
   PharmaSense API-backed authentication.
   ======================================================= */
const AUTH_SESSION_KEY = "ps_session";
const AUTH_LAST_EMAIL_KEY = "ps_last_email";

function getSession(){
  try{
    const stored = localStorage.getItem(AUTH_SESSION_KEY) || sessionStorage.getItem(AUTH_SESSION_KEY);
    if(!stored) return null;

    const session = JSON.parse(stored);
    if(!session.token || !session.name || !session.email){
      clearSession();
      return null;
    }
    if(!localStorage.getItem(AUTH_SESSION_KEY)){
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    }
    return session;
  } catch(e){ return null; }
}
function setSession(session){
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(AUTH_LAST_EMAIL_KEY, session.email);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}
function getLastLoginEmail(){
  return localStorage.getItem(AUTH_LAST_EMAIL_KEY) || "";
}
function clearSession(){
  localStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

async function signup({name, email, password}){
  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if(!trimmedName) return {ok:false, field:"name", message:"Enter your name."};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return {ok:false, field:"email", message:"Enter a valid email address."};
  if(password.length < 8)
    return {ok:false, field:"password", message:"Password must be at least 8 characters."};

  try{
    const response = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({name: trimmedName, email: normalizedEmail, password}),
    });
    setSession({
      token: response.access_token,
      name: response.user.name,
      email: response.user.email,
      loginAt: new Date().toISOString(),
    });
    return {ok:true};
  } catch(error){
    if(error.status === 409) return {ok:false, field:"email", message:error.message};
    if(error.status){
      const field = /\bname\b/i.test(error.message) ? "name"
        : /\bpassword\b|\bpass(word)?\b/i.test(error.message) ? "password" : "email";
      return {ok:false, field, message:error.message};
    }
    throw error;
  }
}

async function login({email, password}){
  const normalizedEmail = email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    return {ok:false, field:"email", message:"Enter a valid email address."};
  if(!password) return {ok:false, field:"password", message:"Enter your password."};

  try{
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({email: normalizedEmail, password}),
    });
    setSession({
      token: response.access_token,
      name: response.user.name,
      email: response.user.email,
      loginAt: new Date().toISOString(),
    });
    return {ok:true};
  } catch(error){
    if(error.status === 401) return {ok:false, field:"password", message:"Email or password is incorrect."};
    if(error.status){
      const field = /\bpassword\b|\bpass(word)?\b/i.test(error.message) ? "password" : "email";
      return {ok:false, field, message:error.message};
    }
    throw error;
  }
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
