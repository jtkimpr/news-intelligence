let allData = null;
let activeSection = 'today';
const articlesById = {};

// ─── localStorage 키 ──────────────────────────────────────────────────────────
const LS_LIKED      = 'ni_liked';
const LS_DELETED    = 'ni_deleted';
const LS_READ_LATER = 'ni_read_later';
const LS_READ       = 'ni_read';

function getLiked()     { return JSON.parse(localStorage.getItem(LS_LIKED)      || '{}'); }
function getDeleted()   { return JSON.parse(localStorage.getItem(LS_DELETED)    || '[]'); }
function getReadLater() { return JSON.parse(localStorage.getItem(LS_READ_LATER) || '{}'); }
function getRead()      { return JSON.parse(localStorage.getItem(LS_READ)       || '{}'); }

function markRead(id) {
  const read = getRead();
  if (!read[id]) {
    read[id] = true;
    localStorage.setItem(LS_READ, JSON.stringify(read));
    const titleEl = document.querySelector(`#card-${id} .card-title`);
    if (titleEl) titleEl.classList.add('is-read');
  }
}

function cleanSummary(text) {
  return (text || '').replace(/^#+\s+[^\n]*\n?/, '').trim();
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

const API_BASE = 'https://api.pigeonbrief.com';

async function loadData() {
  try {
    const token = await window.Clerk.session.getToken();
    const res = await fetch(`${API_BASE}/api/articles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`API 오류 (${res.status})`);
    allData = await res.json();
  } catch(e) {
    document.getElementById('card-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>데이터를 불러오지 못했어요.<br><small style="color:#bbb">${e.message}</small></p>
        <button class="btn-primary" style="margin-top:12px" onclick="loadData()">다시 시도</button>
      </div>`;
    return;
  }

  (allData.sections || []).forEach(sec =>
    (sec.articles || []).forEach(a => { articlesById[a.id] = a; })
  );
  buildNav();

  // 섹션이 없는 신규 사용자 → 온보딩 위저드
  if (!allData.sections || allData.sections.length === 0) {
    showOnboardingWizard();
    return;
  }

  render();
}

// index.html에서 Clerk 인증 완료 후 호출
window.initApp = function() {
  loadData();
};

// ─── 네비게이션 빌드 ──────────────────────────────────────────────────────────

let dragSrcIdx  = null;
let isDragging  = false;

function buildNav() {
  const nav = document.getElementById('section-tabs');
  nav.innerHTML = '';

  // 고정 탭: Today / Read Later
  [
    { id: 'today',      label: 'Today' },
    { id: 'read-later', label: 'Read Later' },
  ].forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'tab tab-fixed' + (activeSection === id ? ' active' : '');
    btn.dataset.section = id;
    btn.textContent = label;
    nav.appendChild(btn);
  });

  // 구분선
  const sep = document.createElement('span');
  sep.className = 'tab-sep';
  nav.appendChild(sep);

  // 주제별 섹션 탭 (draggable)
  (allData.sections || []).forEach((sec, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab tab-section' + (activeSection === sec.id ? ' active' : '');
    btn.dataset.section = sec.id;
    btn.draggable = true;
    btn.textContent = sec.name;

    btn.addEventListener('dragstart', e => {
      isDragging = true;
      dragSrcIdx = i;
      btn.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    btn.addEventListener('dragover', e => {
      e.preventDefault();
      btn.classList.add('drag-over');
    });

    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));

    btn.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (dragSrcIdx === null || dragSrcIdx === i) return;

      const sections = allData.sections;
      const [moved] = sections.splice(dragSrcIdx, 1);
      sections.splice(i, 0, moved);
      buildNav();
      render();

      const newIds = allData.sections.map(s => s.id);
      if (window.saveSectionOrder) window.saveSectionOrder(newIds);
    });

    btn.addEventListener('dragend', () => {
      isDragging = false;
      dragSrcIdx = null;
      nav.querySelectorAll('.tab-section').forEach(t =>
        t.classList.remove('dragging', 'drag-over')
      );
    });

    nav.appendChild(btn);
  });

  // "+" 새 섹션 버튼
  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.title = '새 섹션 추가';
  addBtn.textContent = '+';
  nav.appendChild(addBtn);

  // 탭 전환 (이벤트 위임)
  nav.addEventListener('click', e => {
    if (isDragging) return;
    const tab = e.target.closest('.tab');
    if (!tab) return;

    if (tab.classList.contains('tab-add')) {
      if (window.openSettings) window.openSettings('__new__');
      return;
    }

    const sid = tab.dataset.section;
    if (!sid) return;
    nav.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeSection = sid;
    render();
  });
}

// ─── 현재 섹션 설정 열기 (헤더 ⚙️ 버튼용) ────────────────────────────────────

window.openSettingsForCurrent = function() {
  if (window.openSettings) window.openSettings(activeSection);
};

// ─── 렌더링 ───────────────────────────────────────────────────────────────────

function render() {
  const grid    = document.getElementById('card-grid');
  const deleted = new Set(getDeleted());

  if (activeSection === 'today') {
    const arts = getTodayArticles().filter(a => !deleted.has(a.id));
    grid.innerHTML = arts.length
      ? arts.map(makeCard).join('')
      : '<div class="empty-state">오늘 수집된 기사가 없습니다.</div>';

  } else if (activeSection === 'read-later') {
    const arts = getReadLaterArticles().filter(a => !deleted.has(a.id));
    grid.innerHTML = arts.length
      ? arts.map(makeCard).join('')
      : '<div class="empty-state"><div class="empty-icon">🔖</div><p>저장된 기사가 없습니다.</p><p class="empty-hint">기사 카드 위에 마우스를 올린 뒤 🔖 버튼을 눌러 저장하세요.</p></div>';

  } else {
    const sec  = (allData?.sections || []).find(s => s.id === activeSection);
    const arts = (sec?.articles || []).filter(a => !deleted.has(a.id));
    grid.innerHTML = arts.length
      ? arts.map(makeCard).join('')
      : '<div class="empty-state">아직 수집된 기사가 없습니다.</div>';
  }
}

// ─── 특수 섹션 데이터 ─────────────────────────────────────────────────────────

function getTodayArticles() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (allData?.sections || [])
    .flatMap(s => s.articles || [])
    .filter(a => a.published_at && new Date(a.published_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
}

function getReadLaterArticles() {
  const saved = getReadLater();
  return Object.keys(saved).map(id => articlesById[id] || saved[id]);
}

// ─── 카드 렌더링 ──────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function makeCard(article) {
  const id      = article.id;
  const isLiked = !!getLiked()[id];
  const isRL    = !!getReadLater()[id];
  const isRead  = !!getRead()[id];

  return `
    <div class="card" id="card-${id}">
      <div class="card-meta">
        <span class="card-source">${article.source_name || ''}</span>
        <span class="card-time">${timeAgo(article.published_at)}</span>
      </div>
      <a class="card-title-link" href="${article.url}" target="_blank" rel="noopener" onclick="markRead('${id}')">
        <div class="card-title${isRead ? ' is-read' : ''}">${article.title}</div>
      </a>
      <div class="card-summary">${cleanSummary(article.summary_ko)}</div>
      <div class="card-footer">
        <div class="card-actions">
          <button class="action-btn ${isLiked ? 'active-like' : ''}"
            data-action="like" data-id="${id}"
            title="${isLiked ? '좋아요 취소' : '좋아요'}">♥</button>
          <button class="action-btn ${isRL ? 'active-rl' : ''}"
            data-action="read-later" data-id="${id}"
            title="${isRL ? 'Read Later 취소' : '나중에 읽기'}">🔖</button>
          <button class="action-btn action-delete"
            data-action="delete" data-id="${id}"
            title="삭제">✕</button>
        </div>
        <a class="card-link" href="${article.url}" target="_blank" rel="noopener" onclick="markRead('${id}')">
          원문 보기
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:2px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    </div>`;
}

// ─── 카드 액션 (이벤트 위임) ─────────────────────────────────────────────────

document.getElementById('card-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.preventDefault();
  const { action, id } = btn.dataset;
  if (action === 'like')            toggleLike(id);
  else if (action === 'read-later') toggleReadLater(id);
  else if (action === 'delete')     deleteArticle(id);
});

function toggleLike(id) {
  const liked = getLiked();
  if (liked[id]) {
    delete liked[id];
  } else {
    const a = articlesById[id] || getReadLater()[id];
    if (a) liked[id] = a;
  }
  localStorage.setItem(LS_LIKED, JSON.stringify(liked));
  refreshCard(id);
}

function toggleReadLater(id) {
  const rl = getReadLater();
  if (rl[id]) {
    delete rl[id];
  } else {
    const a = articlesById[id];
    if (a) rl[id] = a;
  }
  localStorage.setItem(LS_READ_LATER, JSON.stringify(rl));
  refreshCard(id);
  if (activeSection === 'read-later') render();
}

function deleteArticle(id) {
  const deleted = getDeleted();
  if (!deleted.includes(id)) deleted.push(id);
  localStorage.setItem(LS_DELETED, JSON.stringify(deleted));

  const liked = getLiked();
  delete liked[id];
  localStorage.setItem(LS_LIKED, JSON.stringify(liked));

  const rl = getReadLater();
  delete rl[id];
  localStorage.setItem(LS_READ_LATER, JSON.stringify(rl));

  const card = document.getElementById('card-' + id);
  if (card) card.remove();
}

function refreshCard(id) {
  const article = articlesById[id] || getLiked()[id];
  if (!article) return;
  const card = document.getElementById('card-' + id);
  if (card) card.outerHTML = makeCard(article);
}

// ─── 토스트 알림 ──────────────────────────────────────────────────────────────

window.showToast = function(msg) {
  let toast = document.getElementById('ni-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ni-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
};

// initApp()은 index.html의 Clerk 인증 완료 후 호출됨

// ─── 온보딩 위저드 ────────────────────────────────────────────────────────────

async function pbApi(method, path, body) {
  const token = await window.Clerk.session.getToken();
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function escOb(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const OB_LOGO = `<svg class="wizard-logo" width="44" height="34" viewBox="0 0 96 76" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 66 44 C 52 36 26 22 8 8 C 16 8 34 18 48 30 C 36 20 22 12 16 6 C 32 2 56 14 62 32 Z" fill="currentColor"/>
  <path d="M 66 44 C 74 40 84 32 84 22 C 84 12 76 8 70 14 C 66 20 66 36 66 44 Z" fill="currentColor"/>
  <path d="M 66 44 C 56 54 44 60 38 56 C 46 50 56 46 66 44 Z" fill="currentColor"/>
  <polygon points="84,20 96,24 84,28" fill="currentColor"/>
  <circle cx="76" cy="16" r="3" fill="white"/>
</svg>`;

function obSteps(active) {
  // active: 1, 2, 3
  const dot = (n) => `<span class="wizard-step-dot ${n < active ? 'done' : n === active ? 'active' : ''}"></span>`;
  const line = (n) => `<span class="wizard-step-line ${n < active ? 'done' : ''}"></span>`;
  return `<div class="wizard-steps">${dot(1)}${line(1)}${dot(2)}${line(2)}${dot(3)}</div>`;
}

function showOnboardingWizard() {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${OB_LOGO}
      ${obSteps(1)}
      <h2 class="wizard-title">PigeonBrief에 오신 걸 환영해요!</h2>
      <p class="wizard-subtitle">첫 번째 주제를 만들어볼게요.<br>관심 있는 뉴스 분야를 하나 정해보세요.</p>
      <div class="wizard-field">
        <label class="wizard-label">주제 이름</label>
        <input id="ob-section-name" class="wizard-input"
          placeholder="예: AI, 경제, 스타트업, 반도체"
          onkeydown="if(event.key==='Enter') obCreateSection()" />
      </div>
      <div class="wizard-field">
        <label class="wizard-label">설명 <span class="wizard-optional">(선택)</span></label>
        <input id="ob-section-desc" class="wizard-input"
          placeholder="이 주제에 대한 간단한 설명"
          onkeydown="if(event.key==='Enter') obCreateSection()" />
      </div>
      <div id="ob1-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions">
        <button id="ob1-btn" class="btn-primary" onclick="obCreateSection()">다음 →</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('ob-section-name')?.focus(), 80);
}

async function obCreateSection() {
  const name  = document.getElementById('ob-section-name')?.value.trim();
  const desc  = document.getElementById('ob-section-desc')?.value.trim() || '';
  const errEl = document.getElementById('ob1-error');
  if (!name) {
    errEl.textContent = '주제 이름을 입력해 주세요.';
    errEl.style.display = '';
    return;
  }
  const btn = document.getElementById('ob1-btn');
  btn.disabled = true; btn.textContent = '생성 중...';
  errEl.style.display = 'none';
  try {
    const result = await pbApi('POST', '/api/settings/sections', { name, description: desc });
    obStep2(result.id, name);
  } catch(e) {
    errEl.textContent = '오류가 발생했어요: ' + e.message;
    errEl.style.display = '';
    btn.disabled = false; btn.textContent = '다음 →';
  }
}

function obStep2(sectionId, sectionName) {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${obSteps(2)}
      <h2 class="wizard-title">"${escOb(sectionName)}"에<br>뉴스 소스를 등록해요</h2>
      <p class="wizard-subtitle">RSS 피드나 키워드를 추가하면 AI가 관련 뉴스를 수집해요.<br>지금 건너뛰고 나중에 설정에서 추가해도 돼요.</p>
      <div class="wizard-source-tabs">
        <button class="wizard-tab active" id="ob-tab-rss" onclick="obSwitchTab('rss')">📡 RSS 피드</button>
        <button class="wizard-tab" id="ob-tab-kw" onclick="obSwitchTab('kw')">🔍 키워드</button>
      </div>
      <div id="ob-rss-panel" style="width:100%">
        <div class="wizard-field-row">
          <input id="ob-rss-url" class="wizard-input" placeholder="https://feeds.example.com/rss" style="flex:1;min-width:0" />
          <input id="ob-rss-name" class="wizard-input" placeholder="소스 이름" style="width:130px;flex-shrink:0" />
          <button class="btn-secondary" onclick="obAddRss(${sectionId})">추가</button>
        </div>
        <div id="ob-rss-list" class="wizard-tag-list"></div>
      </div>
      <div id="ob-kw-panel" style="display:none;width:100%">
        <div class="wizard-field-row">
          <input id="ob-kw-input" class="wizard-input"
            placeholder="예: AI agent enterprise" style="flex:1;min-width:0"
            onkeydown="if(event.key==='Enter') obAddKeyword(${sectionId})" />
          <button class="btn-secondary" onclick="obAddKeyword(${sectionId})">추가</button>
        </div>
        <div id="ob-kw-list" class="wizard-tag-list"></div>
      </div>
      <div id="ob2-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions wizard-actions-2">
        <button class="wizard-btn-skip" onclick="obComplete('${escOb(sectionName)}')">나중에 하기</button>
        <button class="btn-primary" onclick="obComplete('${escOb(sectionName)}')">설정 완료 →</button>
      </div>
    </div>`;
}

function obSwitchTab(tab) {
  document.getElementById('ob-rss-panel').style.display = tab === 'rss' ? '' : 'none';
  document.getElementById('ob-kw-panel').style.display  = tab === 'kw'  ? '' : 'none';
  document.getElementById('ob-tab-rss').classList.toggle('active', tab === 'rss');
  document.getElementById('ob-tab-kw').classList.toggle('active',  tab === 'kw');
}

async function obAddRss(sectionId) {
  const url   = document.getElementById('ob-rss-url')?.value.trim();
  const name  = document.getElementById('ob-rss-name')?.value.trim();
  const errEl = document.getElementById('ob2-error');
  if (!url || !name) {
    errEl.textContent = 'URL과 이름을 모두 입력해 주세요.';
    errEl.style.display = '';
    return;
  }
  errEl.style.display = 'none';
  try {
    await pbApi('POST', '/api/settings/rss', { section_id: sectionId, url, name });
    document.getElementById('ob-rss-url').value  = '';
    document.getElementById('ob-rss-name').value = '';
    document.getElementById('ob-rss-list').innerHTML += `<span class="wizard-tag">📡 ${escOb(name)}</span>`;
    document.getElementById('ob-rss-url').focus();
  } catch(e) {
    errEl.textContent = '추가 실패: ' + e.message;
    errEl.style.display = '';
  }
}

async function obAddKeyword(sectionId) {
  const query = document.getElementById('ob-kw-input')?.value.trim();
  const errEl = document.getElementById('ob2-error');
  if (!query) return;
  errEl.style.display = 'none';
  try {
    await pbApi('POST', '/api/settings/keywords', { section_id: sectionId, query });
    document.getElementById('ob-kw-input').value = '';
    document.getElementById('ob-kw-list').innerHTML += `<span class="wizard-tag">🔍 ${escOb(query)}</span>`;
    document.getElementById('ob-kw-input').focus();
  } catch(e) {
    errEl.textContent = '추가 실패: ' + e.message;
    errEl.style.display = '';
  }
}

function obComplete(sectionName) {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap wizard-complete">
      ${obSteps(3)}
      <div class="wizard-complete-icon">🎉</div>
      <h2 class="wizard-title">설정 완료!</h2>
      <p class="wizard-subtitle">"${escOb(sectionName)}" 주제가 등록됐어요.</p>
      <div class="wizard-schedule-box">
        🕙 오늘 밤 파이프라인이 실행되면 첫 브리핑이 도착해요.<br>
        <span style="font-size:12px;opacity:0.75">AI가 매일 자동으로 뉴스를 수집하고 한국어로 요약해드려요.</span>
      </div>
      <div class="wizard-actions">
        <button class="btn-primary" onclick="loadData()">PigeonBrief 시작하기 →</button>
      </div>
    </div>`;
}
