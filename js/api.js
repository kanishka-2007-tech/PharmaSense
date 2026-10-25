const API_BASE_URL = (window.PHARMA_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');

async function apiRequest(path, options = {}){
  const headers = new Headers(options.headers || {});
  const session = typeof getSession === 'function' ? getSession() : null;
  if(session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  if(options.body !== undefined) headers.set('Content-Type', 'application/json');

  let response;
  try{
    response = await fetch(`${API_BASE_URL}${path}`, {...options, headers});
  } catch(error){
    throw new Error(`Could not reach the PharmaSense API at ${API_BASE_URL}. Start the FastAPI backend and try again.`);
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if(!response.ok){
    if(response.status === 401 && !path.startsWith('/auth/')){
      if(typeof clearSession === 'function') clearSession();
      if(!['login.html', 'signup.html'].some(page => window.location.pathname.endsWith(page))){
        window.location.href = 'login.html';
      }
    }
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map(issue => {
        const field = issue.loc?.[issue.loc.length - 1];
        return field ? `${field}: ${issue.msg}` : issue.msg;
      }).join(' ')
      : typeof detail === 'string' ? detail : `Request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}
