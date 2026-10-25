/* =======================================================
   PharmaSense — Main App Logic
   ======================================================= */

const session = requireAuth();

const state = { added: [] };
const nameToMed = Object.fromEntries(MEDICINES.map(m => [m.name.toLowerCase(), m]));

const statMeds = document.getElementById('statMeds');
const statInteractions = document.getElementById('statInteractions');
if(statMeds) statMeds.textContent = `${MEDICINES.length}+`;
if(statInteractions) statInteractions.textContent = `${INTERACTIONS.length}+`;

// ---------- sidebar elements ----------
const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburger = document.getElementById('hamburger');
const sidebarAvatar = document.getElementById('sidebarAvatar');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserEmail = document.getElementById('sidebarUserEmail');
const sidebarLogout = document.getElementById('sidebarLogout');
const sidebarRecentList = document.getElementById('sidebarRecentList');

// ---------- main elements ----------
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const chipsEl = document.getElementById('chips');
const chipsArea = document.getElementById('chipsArea');
const chipsLabel = document.getElementById('chipsLabel');
const checkBtn = document.getElementById('checkBtn');
const clearBtn = document.getElementById('clearBtn');
const emptyHint = document.getElementById('emptyHint');
const resultsEl = document.getElementById('results');
const resultsListEl = document.getElementById('resultsList');
const resultCountEl = document.getElementById('resultCount');
const verdictCard = document.getElementById('verdictCard');
const verdictIcon = document.getElementById('verdictIcon');
const verdictLabel = document.getElementById('verdictLabel');
const verdictTitle = document.getElementById('verdictTitle');
const verdictText = document.getElementById('verdictText');
const verdictMeds = document.getElementById('verdictMeds');
const welcomeBanner = document.getElementById('welcomeBanner');
const historyList = document.getElementById('historyList');
const historyPanel = document.getElementById('historyPanel');
const fontSizeBtn = document.getElementById('fontSizeBtn');
const dashboardSection = document.getElementById('dashboardSection');
const specialistGuideSection = document.getElementById('specialistGuideSection');
const consultationSection = document.getElementById('consultationSection');
const deliverySection = document.getElementById('deliverySection');
const scanMedicineBtn = document.getElementById('scanMedicineBtn');
const medicineImageInput = document.getElementById('medicineImageInput');
const scannerPanel = document.getElementById('scannerPanel');
const scannerClose = document.getElementById('scannerClose');
const scannerPreviewWrap = document.getElementById('scannerPreviewWrap');
const scannerPreview = document.getElementById('scannerPreview');
const scannerStatus = document.getElementById('scannerStatus');
const scannerProgress = document.getElementById('scannerProgress');
const scannerOcr = document.getElementById('scannerOcr');
const scannerOcrText = document.getElementById('scannerOcrText');
const scannerMatches = document.getElementById('scannerMatches');
const scannerMatchList = document.getElementById('scannerMatchList');
const scannerSearchFallback = document.getElementById('scannerSearchFallback');

// ---------- sidebar user ----------
sidebarAvatar.textContent = initials(session.name);
sidebarUserName.textContent = session.name;
sidebarUserEmail.textContent = session.email;

// ---------- sidebar toggle ----------
function openSidebar(){
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
}
function closeSidebar(){
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}
hamburger.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

sidebarLogout.addEventListener('click', () => { logout(); });

// ---------- sidebar nav ----------
const navItems = document.querySelectorAll('.nav-item');
const aboutSection = document.getElementById('aboutSection');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    const page = item.dataset.page;
    dashboardSection.classList.toggle('visible', page === 'dashboard');
    aboutSection.classList.toggle('visible', page === 'about');
    specialistGuideSection.classList.toggle('visible', page === 'specialist-guide');
    consultationSection.classList.toggle('visible', page === 'consultation');
    deliverySection.classList.toggle('visible', page === 'delivery');
    if(page === 'dashboard') renderDashboard();
    document.querySelector('.checker-section').style.display = page === 'checker' ? 'block' : 'none';
    resultsEl.style.display = page === 'checker' && resultsListEl.innerHTML ? 'block' : 'none';
    historyPanel.style.display = page === 'history' ? 'block' : page === 'checker' && (state.added.length > 0 || getHistory().length > 0) ? 'block' : 'none';
    closeSidebar();
  });
});

function handleServiceRequest(form, message){
  form.addEventListener('submit', e => {
    e.preventDefault();
    form.reset();
    toast(typeof message === 'function' ? message() : message, 'success');
  });
}
handleServiceRequest(document.getElementById('consultationForm'), () => t('consultationReceived'));
handleServiceRequest(document.getElementById('deliveryForm'), () => t('deliveryReceived'));

// ---------- dashboard and dose tracking ----------
const doseStorageKey = `ps_dose_tracker_${session.email}`;
const doseScheduleList = document.getElementById('doseScheduleList');
const severityOrder = ['danger', 'caution', 'safe'];
const severityNames = {danger: 'High risk', caution: 'Caution', safe: 'No known interaction'};

function localDateKey(date){
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function readDoseData(){
  try{
    const data = JSON.parse(localStorage.getItem(doseStorageKey)) || {};
    return {
      schedules: Array.isArray(data.schedules) ? data.schedules.map(schedule => ({
        ...schedule,
        unitsPerDose: Number.isFinite(Number(schedule.unitsPerDose)) && Number(schedule.unitsPerDose) > 0
          ? Number(schedule.unitsPerDose) : 1,
      })) : [],
      stockBatches: Array.isArray(data.stockBatches) ? data.stockBatches : [],
      logs: data.logs && typeof data.logs === 'object' ? data.logs : {},
    };
  } catch(error){
    console.error('Could not read saved dose tracker data.', error);
    toast('Could not read your saved dose tracker. Your existing data has not been changed.', 'error');
    return {schedules: [], stockBatches: [], logs: {}};
  }
}
function saveDoseData(data){
  try{
    localStorage.setItem(doseStorageKey, JSON.stringify(data));
  } catch(error){
    console.error('Could not save dose tracker data.', error);
    toast('Could not save your dose tracker. Check your browser storage and try again.', 'error');
    return false;
  }
  return true;
}
function doseLogKey(scheduleId, dateKey){
  return `${dateKey}:${scheduleId}`;
}
function daysUntilDate(dateKey, referenceKey){
  const [year, month, day] = dateKey.split('-').map(Number);
  const [referenceYear, referenceMonth, referenceDay] = referenceKey.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(referenceYear, referenceMonth - 1, referenceDay)) / 86400000);
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}
function getDoseStatus(data, schedule, dateKey){
  const logged = data.logs[doseLogKey(schedule.id, dateKey)];
  if(logged === 'taken' || logged === 'missed') return logged;
  return 'pending';
}
function getAdherenceSummary(data, now = new Date()){
  const today = localDateKey(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  let taken = 0;
  let due = 0;

  data.schedules.forEach(schedule => {
    const created = new Date(schedule.createdAt);
    const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const firstDay = createdDay > start ? createdDay : start;
    const lastDay = schedule.archivedAt
      ? new Date(new Date(schedule.archivedAt).getFullYear(), new Date(schedule.archivedAt).getMonth(), new Date(schedule.archivedAt).getDate())
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDay = lastDay < new Date(now.getFullYear(), now.getMonth(), now.getDate())
      ? lastDay : new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for(let day = new Date(firstDay); day <= endDay; day.setDate(day.getDate() + 1)){
      const dateKey = localDateKey(day);
      const [scheduledHours, scheduledMinutes] = schedule.time.split(':').map(Number);
      const scheduledAtMinutes = scheduledHours * 60 + scheduledMinutes;
      if(dateKey === localDateKey(created) && scheduledAtMinutes < created.getHours() * 60 + created.getMinutes()) continue;
      if(schedule.archivedAt){
        const archivedAt = new Date(schedule.archivedAt);
        if(dateKey === localDateKey(archivedAt) && scheduledAtMinutes > archivedAt.getHours() * 60 + archivedAt.getMinutes()) continue;
      }
      if(dateKey === today){
        if(scheduledAtMinutes > now.getHours() * 60 + now.getMinutes()) continue;
      }
      due++;
      if(getDoseStatus(data, schedule, dateKey) === 'taken') taken++;
    }
  });

  return {taken, due, rate: due ? Math.round(taken / due * 100) : null};
}
function renderDoseSchedules(){
  const data = readDoseData();
  const today = localDateKey(new Date());
  const active = data.schedules.filter(schedule => !schedule.archivedAt);
  if(!active.length){
    doseScheduleList.innerHTML = '<p class="tracker-empty">No daily doses added yet.</p>';
    return;
  }

  doseScheduleList.innerHTML = active.map(schedule => {
    const status = getDoseStatus(data, schedule, today);
    const timeParts = schedule.time.split(':');
    const displayTime = new Date(2000, 0, 1, Number(timeParts[0]), Number(timeParts[1]))
      .toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
    const [hours, minutes] = timeParts.map(Number);
    const isFuture = hours * 60 + minutes > new Date().getHours() * 60 + new Date().getMinutes();
    const statusLabel = status === 'taken' ? 'Recorded as taken'
      : status === 'missed' ? 'Recorded as missed'
      : isFuture ? 'Upcoming' : 'Awaiting your update';
    return `<div class="dose-row">
      <div class="dose-info"><strong>${escapeHtml(schedule.medicine)}</strong><span>${displayTime} · ${statusLabel} · ${schedule.unitsPerDose} unit${schedule.unitsPerDose === 1 ? '' : 's'} per dose</span></div>
      <div class="dose-actions">
        <button type="button" class="dose-status-button" data-dose-status="taken" data-schedule-id="${escapeHtml(schedule.id)}" ${status === 'taken' || isFuture ? 'disabled' : ''}>Taken</button>
        <button type="button" class="dose-status-button missed" data-dose-status="missed" data-schedule-id="${escapeHtml(schedule.id)}" ${status === 'missed' || isFuture ? 'disabled' : ''}>Missed</button>
        <button type="button" class="dose-remove-button" data-remove-schedule="${escapeHtml(schedule.id)}" aria-label="Remove ${escapeHtml(schedule.medicine)} schedule">Remove</button>
      </div>
    </div>`;
  }).join('');
}
function getDailyUnitsByMedicine(schedules){
  return schedules.filter(schedule => !schedule.archivedAt).reduce((totals, schedule) => {
    const key = schedule.medicine.trim().toLowerCase();
    totals[key] = (totals[key] || 0) + schedule.unitsPerDose;
    return totals;
  }, {});
}
function renderStockBatches(data){
  const today = localDateKey(new Date());
  const batches = data.stockBatches.slice().sort((a, b) =>
    a.expiry.localeCompare(b.expiry) || a.medicine.localeCompare(b.medicine)
  );
  const expired = batches.filter(batch => batch.expiry < today);
  const expiring = batches.filter(batch => batch.expiry >= today && daysUntilDate(batch.expiry, today) <= 30);
  const warnings = [];
  if(expired.length){
    warnings.push(`<div class="stock-warning expired"><strong>${expired.length} expired batch${expired.length === 1 ? '' : 'es'}.</strong> ${expired.map(batch => `${escapeHtml(batch.medicine)} (${escapeHtml(batch.expiry)})`).join(', ')}. Excluded from refill estimates; ask a pharmacist about safe disposal.</div>`);
  }
  if(expiring.length){
    warnings.push(`<div class="stock-warning soon"><strong>${expiring.length} batch${expiring.length === 1 ? '' : 'es'} expiring within 30 days.</strong> ${expiring.map(batch => `${escapeHtml(batch.medicine)} (${escapeHtml(batch.expiry)})`).join(', ')}.</div>`);
  }
  document.getElementById('stockExpiryWarnings').innerHTML = warnings.join('');

  document.getElementById('stockBatchList').innerHTML = batches.length ? batches.map(batch => {
    const days = daysUntilDate(batch.expiry, today);
    const expiryLabel = days < 0 ? `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
      : days === 0 ? 'Expires today'
      : days <= 30 ? `Expires in ${days} day${days === 1 ? '' : 's'}`
      : `Expires ${batch.expiry}`;
    const state = days < 0 ? 'expired' : days <= 30 ? 'soon' : '';
    return `<div class="stock-batch-row">
      <div class="stock-batch-info"><strong>${escapeHtml(batch.medicine)}</strong><span>${escapeHtml(String(batch.units))} units · ${escapeHtml(expiryLabel)}</span></div>
      <span class="stock-expiry-state ${state}">${days < 0 ? 'Expired' : days <= 30 ? 'Check soon' : 'In date'}</span>
      <button type="button" class="dose-remove-button" data-remove-stock="${escapeHtml(batch.id)}" aria-label="Remove ${escapeHtml(batch.medicine)} stock batch">Remove</button>
    </div>`;
  }).join('') : '<p class="tracker-empty">No medicine batches recorded yet.</p>';
}
function renderRefillForecasts(data){
  const today = localDateKey(new Date());
  const dailyUnits = getDailyUnitsByMedicine(data.schedules);
  const medicines = [...new Set([
    ...data.stockBatches.map(batch => batch.medicine.trim()),
    ...data.schedules.filter(schedule => !schedule.archivedAt).map(schedule => schedule.medicine.trim()),
  ])].sort((a, b) => a.localeCompare(b));
  const forecastList = document.getElementById('refillForecastList');
  if(!medicines.length){
    forecastList.innerHTML = '<p class="tracker-empty">Add a dose schedule and stock batch to see a refill estimate.</p>';
    return;
  }

  forecastList.innerHTML = medicines.map(medicine => {
    const key = medicine.toLowerCase();
    const dailyUsage = dailyUnits[key] || 0;
    const batches = data.stockBatches.filter(batch => batch.medicine.trim().toLowerCase() === key && batch.expiry >= today);
    const stockUnits = batches.reduce((total, batch) => total + Number(batch.units), 0);
    let estimate = dailyUsage
      ? 'No unexpired stock recorded. Check the expired-batch warning above.'
      : 'Add a daily dose schedule to estimate remaining supply.';
    let warning = '';
    let refillButton = '';

    if(dailyUsage > 0 && stockUnits > 0){
      const daysLeft = Math.floor(stockUnits / dailyUsage);
      const runout = new Date();
      runout.setHours(0, 0, 0, 0);
      runout.setDate(runout.getDate() + daysLeft);
      estimate = `About ${daysLeft} day${daysLeft === 1 ? '' : 's'} left (${stockUnits} unexpired units at ${dailyUsage} units per day). Estimated run-out: ${runout.toLocaleDateString()}.`;
      const earliestExpiry = batches.reduce((date, batch) => batch.expiry < date ? batch.expiry : date, batches[0].expiry);
      if(earliestExpiry < localDateKey(runout)){
        warning = '<span class="refill-warning">Some stock expires before this estimate; usable supply may be lower.</span>';
      }
      refillButton = `<button type="button" class="dose-status-button" data-prefill-refill="${escapeHtml(medicine)}" data-refill-units="${Math.ceil(dailyUsage * 30)}">Prefill 30-day estimate</button>`;
    }
    return `<div class="refill-forecast-row">
      <div class="refill-forecast-info"><strong>${escapeHtml(medicine)}</strong><span>${escapeHtml(estimate)}</span>${warning}</div>
      ${refillButton}
    </div>`;
  }).join('');
}
function renderDashboard(){
  const data = readDoseData();
  const adherence = getAdherenceSummary(data);
  const history = getHistory();
  const rate = adherence.rate;
  document.getElementById('adherenceValue').textContent = rate === null ? '—' : `${rate}%`;
  document.getElementById('adherenceDetail').textContent = rate === null
    ? 'No scheduled doses were due in the last 7 days.'
    : `${adherence.taken} of ${adherence.due} due doses recorded as taken.`;
  document.getElementById('adherenceProgressBar').style.width = `${rate ?? 0}%`;
  document.getElementById('adherenceProgress').setAttribute(
    'aria-label',
    rate === null ? 'No medication doses due in the last 7 days' : `Dose adherence ${rate} percent over the last 7 days`
  );
  document.getElementById('dashboardCheckCount').textContent = String(getTotalChecks());

  const severityCounts = {danger: 0, caution: 0, safe: 0};
  history.forEach(entry => {
    if(severityCounts[entry.worstSeverity] !== undefined) severityCounts[entry.worstSeverity]++;
  });
  const commonSeverity = severityOrder.reduce((mostCommon, severity) =>
    severityCounts[severity] > severityCounts[mostCommon] ? severity : mostCommon, 'safe');
  const severityTitle = history.length ? severityNames[commonSeverity] : '—';
  document.getElementById('dashboardCommonSeverity').textContent = severityTitle;
  document.getElementById('dashboardSeverityDetail').textContent = history.length
    ? `${severityCounts[commonSeverity]} of ${history.length} recent checks.`
    : 'Run a medicine check to see a summary.';

  const today = new Date();
  const days = Array.from({length: 7}, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);
    return {date, key: localDateKey(date), count: 0};
  });
  history.forEach(entry => {
    const day = days.find(item => item.key === localDateKey(new Date(entry.at)));
    if(day) day.count++;
  });
  const maxChecks = Math.max(1, ...days.map(day => day.count));
  document.getElementById('checkChart').innerHTML = days.map(day => `
    <div class="check-chart-column" aria-label="${day.key}: ${day.count} checks">
      <span class="check-chart-count">${day.count || ''}</span>
      <div class="check-chart-track"><span style="height:${day.count ? Math.max(8, day.count / maxChecks * 100) : 0}%"></span></div>
      <span class="check-chart-day">${day.date.toLocaleDateString(undefined, {weekday:'short'})}</span>
    </div>
  `).join('');
  document.getElementById('checkChart').setAttribute('aria-label', `${days.reduce((total, day) => total + day.count, 0)} checks in the last 7 days`);

  const severityChart = document.getElementById('severityChart');
  severityChart.innerHTML = history.length ? severityOrder.map(severity => {
    const width = severityCounts[severity] / history.length * 100;
    return width ? `<span class="severity-segment ${severity}" style="width:${width}%" title="${severityNames[severity]}: ${severityCounts[severity]}"></span>` : '';
  }).join('') : '';
  severityChart.setAttribute('aria-label', history.length
    ? severityOrder.map(severity => `${severityNames[severity]}: ${severityCounts[severity]}`).join(', ')
    : 'No saved checks yet');
  document.getElementById('severityLegend').innerHTML = history.length ? severityOrder.map(severity =>
    `<span><i class="severity-key ${severity}"></i>${severityNames[severity]} <strong>${severityCounts[severity]}</strong></span>`
  ).join('') : '<span>No checks recorded yet.</span>';
  renderDoseSchedules();
  renderStockBatches(data);
  renderRefillForecasts(data);
}

document.getElementById('doseScheduleForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const medicine = form.elements.medicine.value.trim();
  const time = form.elements.time.value;
  const unitsPerDose = Number(form.elements.unitsPerDose.value);
  if(!medicine || !time || !Number.isFinite(unitsPerDose) || unitsPerDose <= 0 || unitsPerDose > 100){
    toast('Enter a medicine, dose time, and valid prescribed units per dose.', 'error');
    return;
  }

  const data = readDoseData();
  if(data.schedules.some(schedule => !schedule.archivedAt && schedule.medicine.toLowerCase() === medicine.toLowerCase() && schedule.time === time)){
    toast('That medicine already has a daily dose at this time.', 'info');
    return;
  }
  data.schedules.push({
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    medicine,
    time,
    unitsPerDose,
    createdAt: new Date().toISOString(),
  });
  if(!saveDoseData(data)) return;
  form.reset();
  form.elements.unitsPerDose.value = '1';
  renderDashboard();
  toast('Daily dose added.', 'success');
});

doseScheduleList.addEventListener('click', event => {
  const statusButton = event.target.closest('[data-dose-status]');
  const removeButton = event.target.closest('[data-remove-schedule]');
  const data = readDoseData();
  const today = localDateKey(new Date());
  if(statusButton){
    const schedule = data.schedules.find(item => item.id === statusButton.dataset.scheduleId && !item.archivedAt);
    if(!schedule) return;
    data.logs[doseLogKey(schedule.id, today)] = statusButton.dataset.doseStatus;
    if(saveDoseData(data)) renderDashboard();
  } else if(removeButton){
    const schedule = data.schedules.find(item => item.id === removeButton.dataset.removeSchedule && !item.archivedAt);
    if(!schedule) return;
    schedule.archivedAt = new Date().toISOString();
    if(saveDoseData(data)) renderDashboard();
  }
});

document.getElementById('stockBatchForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const medicine = form.elements.medicine.value.trim();
  const units = Number(form.elements.units.value);
  const expiry = form.elements.expiry.value;
  if(!medicine || !Number.isInteger(units) || units < 1 || units > 100000 || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)){
    toast('Enter a medicine, a whole-number stock quantity, and a valid expiry date.', 'error');
    return;
  }

  const data = readDoseData();
  data.stockBatches.push({
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    medicine,
    units,
    expiry,
    createdAt: new Date().toISOString(),
  });
  if(!saveDoseData(data)) return;
  form.reset();
  renderDashboard();
  toast('Medicine batch added.', 'success');
});

document.getElementById('stockBatchList').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-stock]');
  if(!button) return;
  const data = readDoseData();
  const index = data.stockBatches.findIndex(batch => batch.id === button.dataset.removeStock);
  if(index < 0) return;
  data.stockBatches.splice(index, 1);
  if(saveDoseData(data)) renderDashboard();
});

document.getElementById('refillForecastList').addEventListener('click', event => {
  const button = event.target.closest('[data-prefill-refill]');
  if(!button) return;
  const medicineField = document.querySelector('#deliveryForm [name="medicine"]');
  const quantityField = document.querySelector('#deliveryForm [name="quantity"]');
  medicineField.value = button.dataset.prefillRefill;
  quantityField.value = button.dataset.refillUnits;
  document.querySelector('.nav-item[data-page="delivery"]').click();
  medicineField.focus();
  toast('Added an editable 30-day estimate. Confirm the medicine and quantity with your pharmacist before ordering.', 'info');
});

const specialistGuidance = {
  general: {
    title: 'Start with a primary-care doctor or general physician.',
    reason: 'They can review general symptoms, your health history, and medicines, then help decide whether a specialist is needed.',
    next: 'If you are unsure where to go, a local clinic or primary-care service is a reasonable first contact.',
  },
  skin: {
    title: 'A dermatologist may be a suitable specialist.',
    reason: 'Dermatologists care for concerns involving skin, hair, and nails.',
    next: 'A primary-care doctor can also be a good first contact, especially if you are unsure or symptoms are changing quickly.',
  },
  eyes: {
    title: 'An eye-care clinician, such as an ophthalmologist, may be suitable.',
    reason: 'They assess eye health and vision concerns.',
    next: 'Sudden loss of vision or a serious eye injury needs urgent medical attention.',
  },
  'ears-nose-throat': {
    title: 'An ear, nose, and throat (ENT) specialist may be suitable.',
    reason: 'ENT clinicians assess concerns involving the ears, nose, throat, and related areas.',
    next: 'A primary-care doctor can help with initial assessment and referral where needed.',
  },
  teeth: {
    title: 'A dentist may be a suitable first contact.',
    reason: 'Dentists assess teeth, gums, and other oral-health concerns.',
    next: 'For facial swelling with difficulty breathing or swallowing, seek emergency care.',
  },
  digestive: {
    title: 'Start with a primary-care doctor; a gastroenterologist may be appropriate.',
    reason: 'A primary-care clinician can assess digestive symptoms and decide whether a digestive-system specialist is needed.',
    next: 'Seek urgent care for severe sudden abdominal pain, vomiting blood, or black stools.',
  },
  heart: {
    title: 'Start with a clinician; a cardiologist may be appropriate after assessment.',
    reason: 'A clinician can assess heart or circulation concerns and determine whether specialist care is needed.',
    next: 'For chest pain, severe breathlessness, fainting, or sudden severe symptoms, contact emergency services now.',
  },
  breathing: {
    title: 'Start with a primary-care doctor; a lung specialist may be appropriate.',
    reason: 'A clinician can assess cough or breathing concerns and decide whether a pulmonologist or other specialist is needed.',
    next: 'Severe or sudden difficulty breathing is an emergency. Contact your local emergency service now.',
  },
  'bones-joints': {
    title: 'Start with a primary-care doctor; an orthopedist may be appropriate.',
    reason: 'A clinician can assess bone, joint, or muscle concerns and determine whether an orthopedic specialist is needed.',
    next: 'A serious injury, visible deformity, or inability to use a limb needs prompt medical assessment.',
  },
  headaches: {
    title: 'Start with a primary-care doctor; a neurologist may be appropriate.',
    reason: 'A clinician can assess headaches, dizziness, or nerve-related concerns and arrange specialist care if needed.',
    next: 'A sudden severe headache, new weakness, trouble speaking, or sudden confusion needs emergency assessment.',
  },
  urinary: {
    title: 'Start with a primary-care doctor; a urologist may be appropriate.',
    reason: 'A clinician can assess urinary concerns and decide whether a urinary-tract specialist is needed.',
    next: 'Seek urgent assessment for severe pain, inability to urinate, or blood in urine with feeling very unwell.',
  },
  reproductive: {
    title: 'A gynecologist or primary-care doctor may be a suitable first contact.',
    reason: 'They can discuss menstrual or reproductive-health concerns and help decide what assessment or care is appropriate.',
    next: 'If you may be pregnant and have severe pain, heavy bleeding, or feel faint, seek urgent medical care.',
  },
  'mental-wellbeing': {
    title: 'A primary-care doctor or qualified mental-health professional may help.',
    reason: 'A doctor, psychiatrist, psychologist, or counsellor can discuss mood, anxiety, or sleep concerns and appropriate support.',
    next: 'If you may harm yourself or someone else, contact local emergency services or a crisis support service now, and reach out to someone you trust.',
  },
  child: {
    title: 'A pediatrician or primary-care doctor who sees children may be suitable.',
    reason: 'They can assess a child’s symptoms and advise whether further specialist care is needed.',
    next: 'For severe or rapidly worsening symptoms in a child, contact emergency services or urgent medical care.',
  },
};

document.getElementById('specialistGuideForm').addEventListener('submit', event => {
  event.preventDefault();
  const guidance = specialistGuidance[document.getElementById('symptomArea').value];
  if(!guidance) return;

  document.getElementById('specialistResultTitle').textContent = guidance.title;
  document.getElementById('specialistResultReason').textContent = guidance.reason;
  document.getElementById('specialistResultNext').textContent = guidance.next;
  document.getElementById('specialistResult').hidden = false;
});

// ---------- chatbot shortcut ----------
const chatbotToggle = document.getElementById('chatbotToggle');
const chatbotPanel = document.getElementById('chatbotPanel');
const chatbotClose = document.getElementById('chatbotClose');
const chatbotMessages = document.getElementById('chatbotMessages');
const chatbotForm = document.getElementById('chatbotForm');
const chatbotInput = document.getElementById('chatbotInput');
const chatbotMic = document.getElementById('chatbotMic');
const chatbotStatus = document.getElementById('chatbotStatus');
const consultationForm = document.getElementById('consultationForm');
const consultationTimes = [...consultationForm.elements.time.options].slice(1).map(option => option.value);
function setChatbotOpen(isOpen){
  chatbotPanel.classList.toggle('open', isOpen);
  chatbotPanel.setAttribute('aria-hidden', String(!isOpen));
  chatbotToggle.setAttribute('aria-expanded', String(isOpen));
  if(isOpen) chatbotInput.focus();
}
chatbotToggle.addEventListener('click', () => {
  setChatbotOpen(!chatbotPanel.classList.contains('open'));
});
chatbotClose.addEventListener('click', () => setChatbotOpen(false));
document.querySelectorAll('[data-chat-action]').forEach(button => {
  button.addEventListener('click', () => {
    if(button.dataset.chatAction === 'consultation'){
      startConsultationFlow('I want to book a consultation.');
      return;
    }
    chatbotReply(button.textContent.trim(), `Opening ${button.textContent.trim().toLowerCase()} now.`);
    document.querySelector(`.nav-item[data-page="${button.dataset.chatAction}"]`).click();
    setChatbotOpen(false);
  });
});

// ---------- chatbot text + voice assistant ----------
function addChatMessage(text, role){
  const message = document.createElement('div');
  message.className = `chatbot-message chatbot-message-${role}`;
  message.textContent = text;
  chatbotMessages.appendChild(message);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function speakChatbot(text){
  if(!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function chatbotReply(userText, assistantText){
  addChatMessage(userText, 'user');
  addChatMessage(assistantText, 'assistant');
  speakChatbot(assistantText);
}

function navigateFromChat(page, reply, userText){
  document.querySelector(`.nav-item[data-page="${page}"]`).click();
  chatbotReply(userText, reply);
}

const consultationFlow = { step: null, data: {} };

function assistantOnly(text){
  addChatMessage(text, 'assistant');
  speakChatbot(text);
}

function startConsultationFlow(userText){
  consultationFlow.step = 'name';
  consultationFlow.data = {};
  document.querySelector('.nav-item[data-page="consultation"]').click();
  chatbotReply(userText, 'I can book that for you. What is your full name?');
}

function dateForForm(value){
  const text = value.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let date;

  if(text === 'today') date = new Date(today);
  else if(text === 'tomorrow') date = new Date(today.getTime() + 86400000);
  else if(/^\d{4}-\d{2}-\d{2}$/.test(text)) date = new Date(`${text}T12:00:00`);
  else date = new Date(text);

  if(Number.isNaN(date.getTime()) || date < today) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function timeForForm(value){
  const text = value.trim().toLowerCase();
  const number = Number.parseInt(text, 10);
  if(number >= 1 && number <= consultationTimes.length) return consultationTimes[number - 1];
  if(/9|morning/.test(text)) return consultationTimes[0];
  if(/12|noon|afternoon/.test(text)) return consultationTimes[1];
  if(/3/.test(text)) return consultationTimes[2];
  if(/6|evening|night/.test(text)) return consultationTimes[3];
  return '';
}

function handleConsultationAnswer(rawText){
  const answer = rawText.trim();
  if(!answer) return;
  addChatMessage(answer, 'user');

  if(consultationFlow.step === 'name'){
    if(answer.length < 2){ assistantOnly('Please tell me your full name so I can book the consultation.'); return; }
    consultationFlow.data.name = answer;
    consultationFlow.step = 'phone';
    assistantOnly('What phone number should the doctor use to contact you?');
    return;
  }
  if(consultationFlow.step === 'phone'){
    if(!/[0-9]{7,}/.test(answer.replace(/\D/g, ''))){ assistantOnly('Please provide a valid phone number with at least 7 digits.'); return; }
    consultationFlow.data.phone = answer;
    consultationFlow.step = 'date';
    assistantOnly('What date would you prefer? You can say tomorrow or provide a date such as 2026-10-05.');
    return;
  }
  if(consultationFlow.step === 'date'){
    const date = dateForForm(answer);
    if(!date){ assistantOnly('That date is invalid or has already passed. Please provide a future date, such as 2026-10-05.'); return; }
    consultationFlow.data.date = date;
    consultationFlow.step = 'time';
    assistantOnly('Which time works best? Say 1 for 9 AM to 12 PM, 2 for 12 PM to 3 PM, 3 for 3 PM to 6 PM, or 4 for 6 PM to 9 PM.');
    return;
  }
  if(consultationFlow.step === 'time'){
    const time = timeForForm(answer);
    if(!time){ assistantOnly('Please choose time 1, 2, 3, or 4 from the available consultation slots.'); return; }
    consultationFlow.data.time = time;
    consultationFlow.step = 'concern';
    assistantOnly('Please briefly describe the issue or medicines you want to discuss with the doctor.');
    return;
  }
  if(consultationFlow.step === 'concern'){
    if(answer.length < 3){ assistantOnly('Please provide a short description so the doctor knows how to help.'); return; }
    consultationFlow.data.concern = answer;
    const data = consultationFlow.data;
    consultationForm.elements.name.value = data.name;
    consultationForm.elements.phone.value = data.phone;
    consultationForm.elements.date.value = data.date;
    consultationForm.elements.time.value = data.time;
    consultationForm.elements.concern.value = data.concern;
    consultationForm.requestSubmit();
    consultationFlow.step = null;
    assistantOnly(`Your consultation request has been booked for ${data.date}, ${data.time}. A doctor can contact you at ${data.phone}.`);
  }
}

function answerChatbot(rawText){
  const text = rawText.trim();
  if(!text) return;
  if(consultationFlow.step){
    handleConsultationAnswer(text);
    return;
  }
  const lower = text.toLowerCase();

  if(/\b(specialist|which doctor|what kind of doctor|doctor for|symptom guide)\b/.test(lower)){
    navigateFromChat('specialist-guide', 'I’m opening the symptom-to-specialist guide. It offers general starting points, not a diagnosis.', text);
    return;
  }
  if(/\b(consult|consultation|doctor|speak to a doctor|medical advice|issue|problem|symptom|side effect|unwell)\b/.test(lower)){
    startConsultationFlow(text);
    return;
  }
  if(/\b(delivery|deliver|order|pharmacy|refill)\b/.test(lower)){
    navigateFromChat('delivery', 'I’m opening the medicine delivery request form for you.', text);
    return;
  }

  const foundMedicines = MEDICINES.filter(m => lower.includes(m.name.toLowerCase()));
  if(foundMedicines.length >= 2 && /\b(check|interaction|interactions|safe|together|combine|mix)\b/.test(lower)){
    foundMedicines.forEach(m => addMedicine(m.name));
    document.querySelector('.nav-item[data-page="checker"]').click();
    chatbotReply(text, `I added ${foundMedicines.map(m => m.name).join(' and ')} to the checker. Review the results there before taking medicines together.`);
    return;
  }
  if(/\b(checker|check medicines|check interactions|interaction)\b/.test(lower)){
    navigateFromChat('checker', 'I’m opening the interaction checker. Add at least two medicines to compare them.', text);
    return;
  }
  if(/\b(hello|hi|hey|help)\b/.test(lower)){
    chatbotReply(text, 'You can ask me which kind of doctor to see, check medicine interactions, open a doctor consultation, or request medicine delivery.');
    return;
  }
  chatbotReply(text, 'I can open the symptom-to-specialist guide, interaction checker, doctor consultation, or medicine delivery. Try saying “which doctor should I see?”');
}

chatbotForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = chatbotInput.value;
  chatbotInput.value = '';
  answerChatbot(text);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if(SpeechRecognition){
  const recognition = new SpeechRecognition();
  recognition.lang = window.psSpeechLanguage || 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.addEventListener('start', () => {
    chatbotMic.classList.add('listening');
    chatbotStatus.textContent = t('voiceHint');
  });
  recognition.addEventListener('result', event => {
    const transcript = event.results[0][0].transcript;
    chatbotInput.value = transcript;
    chatbotForm.requestSubmit();
  });
  recognition.addEventListener('error', event => {
    chatbotStatus.textContent = event.error === 'not-allowed'
      ? 'Microphone permission was blocked'
      : 'I could not hear that. Please try again.';
  });
  recognition.addEventListener('end', () => {
    chatbotMic.classList.remove('listening');
    if(chatbotStatus.textContent === t('voiceHint')) chatbotStatus.textContent = t('voiceHint');
  });
  window.addEventListener('ps-language-change', event => { recognition.lang = event.detail.speech; });
  chatbotMic.addEventListener('click', () => {
    if(chatbotMic.classList.contains('listening')) recognition.stop();
    else recognition.start();
  });
} else {
  chatbotMic.disabled = true;
  chatbotMic.title = 'Voice input is not supported in this browser';
  chatbotStatus.textContent = 'Voice input is not supported here; you can type instead.';
}

// ---------- font size toggle ----------
fontSizeBtn.addEventListener('click', () => {
  document.body.classList.toggle('large-text');
  const isLarge = document.body.classList.contains('large-text');
  localStorage.setItem('ps_large_text', isLarge ? '1' : '0');
  toast(isLarge ? t('largeEnabled') : t('largeDisabled'), 'info');
});
if(localStorage.getItem('ps_large_text') === '1'){
  document.body.classList.add('large-text');
}

// ---------- welcome banner (first login, per session) ----------
if(!sessionStorage.getItem('ps_welcomed')){
  welcomeBanner.style.display = 'flex';
  sessionStorage.setItem('ps_welcomed', '1');
}
document.getElementById('dismissWelcome')?.addEventListener('click', () => {
  welcomeBanner.style.display = 'none';
});

// ---------- history (per user, persisted) ----------
const HISTORY_KEY = `ps_history_${session.email}`;
const CHECK_COUNT_KEY = `ps_check_count_${session.email}`;
function getHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch(e){ return []; }
}
function getTotalChecks(){
  const stored = localStorage.getItem(CHECK_COUNT_KEY);
  if(stored === null){
    const initialCount = getHistory().length;
    localStorage.setItem(CHECK_COUNT_KEY, String(initialCount));
    return initialCount;
  }
  const count = Number(stored);
  return Number.isSafeInteger(count) && count >= 0 ? count : getHistory().length;
}
function pushHistory(meds, findingsCount, worstSeverity){
  const totalChecks = getTotalChecks() + 1;
  const hist = getHistory();
  hist.unshift({
    meds, findingsCount, worstSeverity,
    at: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 8)));
  localStorage.setItem(CHECK_COUNT_KEY, String(totalChecks));
  renderHistory();
}
function renderHistory(){
  const hist = getHistory();

  // main history section
  if(hist.length === 0){
    historyList.innerHTML = `<div class="history-empty">${t('historyEmpty')}</div>`;
  } else {
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

  // sidebar recent
  if(hist.length === 0){
    sidebarRecentList.innerHTML = '<div class="sidebar-empty">No checks yet</div>';
  } else {
    sidebarRecentList.innerHTML = hist.slice(0, 5).map(h => {
      const dot = h.worstSeverity === 'danger' ? 'danger' : h.worstSeverity === 'caution' ? 'caution' : 'safe';
      const when = new Date(h.at);
      const timeStr = when.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
      return `<div class="sidebar-recent-item" data-meds='${JSON.stringify(h.meds)}'>
        <span class="sidebar-recent-dot ${dot}"></span>
        <span class="sidebar-recent-meds">${h.meds.join(', ')}</span>
        <span class="sidebar-recent-meta">${timeStr}</span>
      </div>`;
    }).join('');
  }
  renderDashboard();
}

historyList?.addEventListener('click', (e) => {
  const btn = e.target.closest('.history-item');
  if(!btn) return;
  loadFromHistory(btn);
});
sidebarRecentList?.addEventListener('click', (e) => {
  const item = e.target.closest('.sidebar-recent-item');
  if(!item) return;
  loadFromHistory(item);
});

function loadFromHistory(el){
  const meds = JSON.parse(el.dataset.meds);
  state.added = meds.filter(m => nameToMed[m.toLowerCase()]);
  renderChips();
  document.querySelector('.nav-item[data-page="checker"]').click();
  toast('Loaded from history', 'info');
  window.scrollTo({top: 0, behavior: 'smooth'});
}
renderHistory();

// ---------- prescription / strip scanner ----------
function openScanner(){
  scannerPanel.hidden = false;
  scannerStatus.textContent = window.Tesseract ? 'Choose a clear, well-lit photo.' : 'Scanner is unavailable offline. Use the search box instead.';
  scannerPanel.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function resetScanner(){
  scannerPanel.hidden = true;
  medicineImageInput.value = '';
  scannerPreview.removeAttribute('src');
  scannerPreviewWrap.hidden = true;
  scannerProgress.hidden = true;
  scannerOcr.hidden = true;
  scannerMatches.hidden = true;
  scannerMatchList.innerHTML = '';
}
scanMedicineBtn.addEventListener('click', () => { openScanner(); medicineImageInput.click(); });
scannerClose.addEventListener('click', resetScanner);
scannerSearchFallback.addEventListener('click', () => { resetScanner(); searchInput.focus(); });
medicineImageInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if(file) scanMedicineImage(file);
});

function normalizeOcr(value){
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function levenshtein(a, b){
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for(let i = 1; i <= a.length; i++){
    let previous = row[0]; row[0] = i;
    for(let j = 1; j <= b.length; j++){
      const current = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? previous
        : Math.min(previous + 1, row[j - 1] + 1, current + 1);
      previous = current;
    }
  }
  return row[b.length];
}
function medicineMatches(ocrText){
  const normalized = normalizeOcr(ocrText);
  const words = normalized.split(' ').filter(Boolean);
  return MEDICINES.map(med => {
    const name = normalizeOcr(med.name);
    const nameWords = name.split(' ');
    const exact = normalized.includes(name) || nameWords.some(word => words.includes(word));
    const distance = Math.min(...nameWords.map(word => {
      const closest = words.length ? Math.min(...words.map(candidate => levenshtein(word, candidate))) : word.length;
      return closest / Math.max(word.length, 1);
    }));
    const score = exact ? 0.98 : Math.max(0, 1 - distance);
    return {med, score};
  }).filter(result => !state.added.includes(result.med.name))
    .filter(result => result.score >= 0.42)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
function prepareImage(file){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const max = 1800, scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for(let i = 0; i < pixels.data.length; i += 4){
        const gray = pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114;
        const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = contrast;
      }
      ctx.putImageData(pixels, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}
async function scanMedicineImage(file){
  if(!window.Tesseract){ scannerStatus.textContent = 'OCR is unavailable. Use the search box instead.'; return; }
  scannerPreview.src = URL.createObjectURL(file);
  scannerPreviewWrap.hidden = false;
  scannerOcr.hidden = true;
  scannerMatches.hidden = true;
  scannerProgress.hidden = false;
  scannerStatus.textContent = 'Preparing image...';
  try{
    const image = await prepareImage(file);
    scannerStatus.textContent = 'Reading medicine text...';
    const result = await Tesseract.recognize(image, 'eng', {
      logger: message => {
        if(message.status === 'recognizing text') scannerProgress.querySelector('span').style.width = `${Math.round((message.progress || 0) * 100)}%`;
      }
    });
    const text = result.data.text.trim();
    scannerOcrText.textContent = text || 'No readable text found';
    scannerOcr.hidden = false;
    const matches = medicineMatches(text);
    scannerMatchList.innerHTML = matches.length ? matches.map((match, index) => `
      <button class="scanner-match" type="button" data-match-index="${index}">
        <span><strong>${match.med.name}</strong><small>${match.med.cls}</small></span>
        <em>${Math.round(match.score * 100)}% match</em>
      </button>`).join('') : '<div class="scanner-no-match">No confident match. Try a closer photo or search manually.</div>';
    scannerMatches.hidden = false;
    scannerStatus.textContent = matches.length ? 'Review the suggestions below before adding one.' : 'We could not confidently identify a medicine.';
    scannerMatchList.querySelectorAll('[data-match-index]').forEach(button => button.addEventListener('click', () => {
      const match = matches[Number(button.dataset.matchIndex)];
      addMedicine(match.med.name);
      scannerStatus.textContent = `${match.med.name} added to your medicines.`;
      scannerMatches.hidden = true;
    }));
  } catch(error){
    scannerStatus.textContent = 'Could not read that image. Try a sharper, better-lit photo or search manually.';
    scannerMatches.hidden = true;
  } finally {
    scannerProgress.hidden = true;
  }
}

// ---------- search / autocomplete ----------
let activeIndex = -1;
let currentMatches = [];

function renderSuggestions(query){
  if(!query){ suggestionsEl.classList.remove('open'); suggestionsEl.innerHTML = ''; return; }
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
  emptyHint.textContent = state.added.length === 0 ? t('addTwo') : t('addOne');

  if(state.added.length > 0){
    chipsArea.classList.add('visible');
    chipsLabel.textContent = `${t('selectedMedicines')} (${state.added.length})`;
  } else {
    chipsArea.classList.remove('visible');
  }
}

searchInput.addEventListener('input', e => renderSuggestions(e.target.value));

searchInput.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('.suggestion[data-idx]');
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    items.forEach((el,i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex]?.scrollIntoView({block: 'nearest'});
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    items.forEach((el,i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex]?.scrollIntoView({block: 'nearest'});
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
  if(!e.target.closest('.search-container')){ suggestionsEl.classList.remove('open'); }
});

clearBtn.addEventListener('click', () => {
  state.added = [];
  renderChips();
  resultsEl.style.display = 'none';
});

// ---------- interaction checking ----------
function findInteraction(nameA, nameB){
  const a = nameA.toLowerCase(), b = nameB.toLowerCase();
  return INTERACTIONS.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}
function severityLabel(sev){
  return sev === 'danger' ? t('highRisk') : sev === 'caution' ? t('caution') : t('safe');
}

function runCheck(){
  const meds = state.added;
  const findings = [];

  for(let i = 0; i < meds.length; i++){
    for(let j = i + 1; j < meds.length; j++){
      const hit = findInteraction(meds[i], meds[j]);
      if(hit){
        findings.push({ pair:[meds[i], meds[j]], severity: hit.severity, text: hit.text, reco: hit.reco, duplicate: false });
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
        severity: 'caution',
        text: `These are both classified as ${cls}, so taking them together means overlapping effects and higher combined side-effect risk rather than added benefit.`,
        reco: `Confirm with a doctor whether both are actually needed, or if one duplicates the other.`,
        duplicate: true
      });
    }
  });

  const order = {danger: 0, caution: 1, safe: 2};
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

function renderResults(findings){
  resultsEl.style.display = 'block';
  resultCountEl.textContent = findings.length
    ? `(${findings.length} finding${findings.length > 1 ? 's' : ''})`
    : '';

  const hasDanger = findings.some(f => f.severity === 'danger');
  const hasCaution = findings.some(f => f.severity === 'caution');
  const verdict = hasDanger ? 'avoid' : hasCaution ? 'caution' : 'safe';
  const verdictContent = {
    avoid: {
      label: 'Overall result - AVOID',
      title: 'Avoid combining these medicines',
      text: 'A high-risk interaction was found. Pause and speak with a doctor or pharmacist before taking this combination together.',
      icon: '!'
    },
    caution: {
      label: 'Overall result · CAUTION',
      title: 'Use caution with this combination',
      text: 'A potential interaction was found. It may be manageable with timing, monitoring, or a prescriber advice.',
      icon: 'i'
    },
    safe: {
      label: 'Overall result · SAFE*',
      title: 'No known interactions found',
      text: 'Nothing in this checker curated dataset suggests a known interaction between these medicines. This is not a guarantee of safety.',
      icon: 'OK'
    }
  }[verdict];
  verdictCard.className = `verdict-card ${verdict}`;
  verdictIcon.textContent = verdictContent.icon;
  verdictLabel.textContent = verdictContent.label;
  verdictTitle.textContent = verdictContent.title;
  verdictText.textContent = verdictContent.text;
  verdictMeds.innerHTML = state.added.map(name => `<span>${name}</span>`).join('');

  if(findings.length === 0){
    resultsListEl.innerHTML = `<div class="all-clear"><strong>Nothing to flag in this check</strong>We found no conflicts among these ${state.added.length} medicines in the curated dataset.</div>`;
    return;
  }

  resultsListEl.innerHTML = findings.map(f => `
    <div class="note-card ${f.severity}">
      ${f.duplicate ? `<div class="duplicate-tag">${t('duplicate')}</div>` : ''}
      <div class="note-top">
        <div class="pair-name">${f.pair.join(f.duplicate ? '' : ' + ')}</div>
        <div class="stamp ${f.severity}">${severityLabel(f.severity)}</div>
      </div>
      <div class="note-body">${f.text}</div>
      <div class="note-reco"><strong>${t('whatToDo')}</strong>${f.reco}</div>
    </div>
  `).join('');

  resultsEl.scrollIntoView({behavior: 'smooth', block: 'start'});
}

checkBtn.addEventListener('click', () => {
  checkBtn.classList.add('loading');
  checkBtn.disabled = true;

  setTimeout(() => {
    const findings = runCheck();
    renderResults(findings);
    checkBtn.classList.remove('loading');
    checkBtn.disabled = state.added.length < 2;

    const worst = findings.some(f => f.severity === 'danger') ? 'danger'
      : findings.some(f => f.severity === 'caution') ? 'caution' : 'safe';
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

// Repaint generated content when the user changes language.
window.addEventListener('ps-language-change', () => {
  renderChips();
  renderHistory();
  if(state.added.length >= 2 && resultsListEl.innerHTML) renderResults(runCheck());
});
