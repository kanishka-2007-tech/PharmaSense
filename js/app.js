/* =======================================================
   Main app logic for index.html (the checker itself)
   ======================================================= */

const session = requireAuth(); // redirects to login.html if not signed in

const state = { added: [] };
const nameToMed = Object.fromEntries(MEDICINES.map(m => [m.name.toLowerCase(), m]));

// ---------- elements ----------
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const chipsEl = document.getElementById('chips');
const checkBtn = document.getElementById('checkBtn');
const clearBtn = document.getElementById('clearBtn');
const emptyHint = document.getElementById('emptyHint');
const resultsEl = document.getElementById('results');
const resultsListEl = document.getElementById('resultsList');
const resultCountEl = document.getElementById('resultCount');
const navUserBtn = document.getElementById('navUserBtn');
const navMenu = document.getElementById('navMenu');
const avatarEl = document.getElementById('avatar');
const userNameEl = document.getElementById('userName');
const userEmailEl = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const welcomeBanner = document.getElementById('welcomeBanner');
const historyList = document.getElementById('historyList');
const historyPanel = document.getElementById('historyPanel');

// ---------- nav / session UI ----------
avatarEl.textContent = initials(session.name);
userNameEl.textContent = session.name;
userEmailEl.textContent = session.email;

navUserBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  navMenu.classList.toggle('open');
});
document.addEventListener('click', () => navMenu.classList.remove('open'));
logoutBtn.addEventListener('click', () => { logout(); });

// first-login welcome banner (per browser session, not persisted)
if(!sessionStorage.getItem('mic_welcomed')){
  welcomeBanner.style.display = 'flex';
  sessionStorage.setItem('mic_welcomed', '1');
}
document.getElementById('dismissWelcome')?.addEventListener('click', () => {
  welcomeBanner.style.display = 'none';
});

// ---------- history (per user, persisted) ----------
const HISTORY_KEY = `mic_history_${session.email}`;
function getHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch(e){ return []; }
}
function pushHistory(meds, findingsCount, worstSeverity){
  const hist = getHistory();
  hist.unshift({
    meds, findingsCount, worstSeverity,
    at: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 8)));
  renderHistory();
}
function renderHistory(){
  const hist = getHistory();
  if(hist.length === 0){
    historyPanel.style.display = 'none';
    return;
  }
  historyPanel.style.display = 'block';
  historyList.innerHTML = hist.map(h => {
    const dot = h.worstSeverity === 'danger' ? 'danger' : h.worstSeverity === 'caution' ? 'caution' : 'safe';
    const when = new Date(h.at);
    const timeStr = when.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' · ' +
      when.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
    return `<button class="history-item" data-meds='${JSON.stringify(h.meds)}'>
      <span class="history-dot ${dot}"></span>
      <span class="history-text">
        <span class="history-meds">${h.meds.join(', ')}</span>
        <span class="history-meta">${timeStr} · ${h.findingsCount ? h.findingsCount + ' finding' + (h.findingsCount>1?'s':'') : 'all clear'}</span>
      </span>
    </button>`;
  }).join('');
}
historyList?.addEventListener('click', (e) => {
  const btn = e.target.closest('.history-item');
  if(!btn) return;
  const meds = JSON.parse(btn.dataset.meds);
  state.added = meds.filter(m => nameToMed[m.toLowerCase()]);
  renderChips();
  toast('Loaded from history', 'info');
  window.scrollTo({top: 0, behavior: 'smooth'});
});
renderHistory();

// ---------- search / autocomplete ----------
let activeIndex = -1;
let currentMatches = [];

function renderSuggestions(query){
  if(!query){ suggestionsEl.classList.remove('open'); suggestionsEl.innerHTML=''; return; }
  const q = query.toLowerCase();
  currentMatches = MEDICINES.filter(m =>
    m.name.toLowerCase().includes(q) &&
    !state.added.includes(m.name)
  ).slice(0, 8);
  activeIndex = -1;

  if(currentMatches.length === 0){
    suggestionsEl.innerHTML = `<div class="suggestion suggestion-empty">No match in this dataset</div>`;
    suggestionsEl.classList.add('open');
    return;
  }
  suggestionsEl.innerHTML = currentMatches.map((m,i) =>
    `<div class="suggestion" data-idx="${i}" role="option"><span>${m.name}</span><span class="class-tag">${m.cls}</span></div>`
  ).join('');
  suggestionsEl.classList.add('open');
}

function addMedicine(name){
  if(!state.added.includes(name)){
    state.added.push(name);
    renderChips();
  }
  searchInput.value = '';
  suggestionsEl.classList.remove('open');
  suggestionsEl.innerHTML = '';
  searchInput.focus();
}

function removeMedicine(name){
  state.added = state.added.filter(n => n !== name);
  renderChips();
  resultsEl.style.display = 'none';
}

function renderChips(){
  chipsEl.innerHTML = state.added.map(name =>
    `<div class="chip">${name}<button data-remove="${name}" aria-label="Remove ${name}">&times;</button></div>`
  ).join('');
  checkBtn.disabled = state.added.length < 2;
  emptyHint.style.display = state.added.length < 2 ? 'block' : 'none';
  emptyHint.textContent = state.added.length === 0
    ? 'Add at least two medicines to run a check.'
    : 'Add one more medicine to run a check.';
}

searchInput.addEventListener('input', e => renderSuggestions(e.target.value));

searchInput.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('.suggestion[data-idx]');
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    items.forEach((el,i)=>el.classList.toggle('active', i===activeIndex));
    items[activeIndex]?.scrollIntoView({block:'nearest'});
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    items.forEach((el,i)=>el.classList.toggle('active', i===activeIndex));
    items[activeIndex]?.scrollIntoView({block:'nearest'});
  } else if(e.key === 'Enter'){
    e.preventDefault();
    if(activeIndex >= 0 && currentMatches[activeIndex]){
      addMedicine(currentMatches[activeIndex].name);
    } else if(currentMatches.length === 1){
      addMedicine(currentMatches[0].name);
    }
  } else if(e.key === 'Escape'){
    suggestionsEl.classList.remove('open');
  }
});

suggestionsEl.addEventListener('click', e => {
  const row = e.target.closest('.suggestion[data-idx]');
  if(row){ addMedicine(currentMatches[+row.dataset.idx].name); }
});

chipsEl.addEventListener('click', e => {
  const btn = e.target.closest('button[data-remove]');
  if(btn){ removeMedicine(btn.dataset.remove); }
});

document.addEventListener('click', e => {
  if(!e.target.closest('.search-row')){ suggestionsEl.classList.remove('open'); }
});

clearBtn.addEventListener('click', () => {
  state.added = [];
  renderChips();
  resultsEl.style.display = 'none';
});

// ---------- interaction checking ----------
function findInteraction(nameA, nameB){
  const a = nameA.toLowerCase(), b = nameB.toLowerCase();
  return INTERACTIONS.find(x => (x.a===a && x.b===b) || (x.a===b && x.b===a));
}
function severityLabel(sev){
  return sev === 'danger' ? 'High risk' : sev === 'caution' ? 'Use caution' : 'Generally safe';
}

function runCheck(){
  const meds = state.added;
  const findings = [];

  for(let i=0;i<meds.length;i++){
    for(let j=i+1;j<meds.length;j++){
      const hit = findInteraction(meds[i], meds[j]);
      if(hit){
        findings.push({ pair:[meds[i], meds[j]], severity: hit.severity, text: hit.text, reco: hit.reco, duplicate:false });
      }
    }
  }

  const classGroups = {};
  meds.forEach(name => {
    const med = nameToMed[name.toLowerCase()];
    if(!med) return;
    (classGroups[med.cls] ||= []).push(name);
  });
  Object.entries(classGroups).forEach(([cls, names]) => {
    if(names.length > 1){
      findings.push({
        pair:[names.join(' + ')],
        severity:'caution',
        text:`These are both classified as ${cls}, so taking them together means overlapping effects and higher combined side-effect risk rather than added benefit.`,
        reco:`Confirm with a doctor whether both are actually needed, or if one duplicates the other.`,
        duplicate:true
      });
    }
  });

  const order = {danger:0, caution:1, safe:2};
  findings.sort((a,b)=>order[a.severity]-order[b.severity]);
  return findings;
}

function renderResults(findings){
  resultsEl.style.display = 'block';
  resultCountEl.textContent = findings.length
    ? `(${findings.length} finding${findings.length>1?'s':''})`
    : '';

  if(findings.length === 0){
    resultsListEl.innerHTML = `<div class="all-clear"><strong>No known interactions found</strong>No conflicts were found among these ${state.added.length} medicines in this checker's dataset. This does not guarantee safety — the dataset covers a curated subset of well-documented interactions, not the full universe of medicines.</div>`;
    return;
  }

  resultsListEl.innerHTML = findings.map(f => `
    <div class="note-card ${f.severity}">
      ${f.duplicate ? `<div class="duplicate-tag">Duplicate therapy</div>` : ''}
      <div class="note-top">
        <div class="pair-name">${f.pair.join(f.duplicate ? '' : ' + ')}</div>
        <div class="stamp ${f.severity}">${severityLabel(f.severity)}</div>
      </div>
      <div class="note-body">${f.text}</div>
      <div class="note-reco"><strong>What to do: </strong>${f.reco}</div>
    </div>
  `).join('');

  resultsEl.scrollIntoView({behavior:'smooth', block:'start'});
}

checkBtn.addEventListener('click', () => {
  checkBtn.classList.add('loading');
  checkBtn.disabled = true;

  // brief, honest "processing" delay — the check itself is instant,
  // this just gives the action weight rather than a jarring snap-render
  setTimeout(() => {
    const findings = runCheck();
    renderResults(findings);
    checkBtn.classList.remove('loading');
    checkBtn.disabled = state.added.length < 2;

    const worst = findings.some(f=>f.severity==='danger') ? 'danger'
      : findings.some(f=>f.severity==='caution') ? 'caution' : 'safe';
    pushHistory([...state.added], findings.length, worst);

    if(findings.some(f => f.severity === 'danger')){
      toast('High-risk interaction found — review before combining', 'error');
    } else if(findings.length){
      toast('Check complete — see findings below', 'info');
    } else {
      toast('No known interactions found', 'success');
    }
  }, 450);
});
