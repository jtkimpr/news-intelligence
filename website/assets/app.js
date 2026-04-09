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

function obSteps(active, total = 5) {
  const dot = (n) => `<span class="wizard-step-dot ${n < active ? 'done' : n === active ? 'active' : ''}"></span>`;
  const line = (n) => `<span class="wizard-step-line ${n < active ? 'done' : ''}"></span>`;
  let html = '<div class="wizard-steps">';
  for (let i = 1; i <= total; i++) {
    html += dot(i);
    if (i < total) html += line(i);
  }
  return html + '</div>';
}

// ─── 위저드 상태 ──────────────────────────────────────────────────────────────
const wizState = {
  topic: '',
  clarificationQuestion: '',
  clarificationAnswer: '',
  keywordSet: null,       // {core_keywords, related_entities, related_concepts, exclude_keywords, recommended_query}
  rssSuggestions: [],     // [{name, url, language, country, categories, score}]
  selectedCoreKeywords: new Set(),
  selectedRssUrls: new Set(),
};

function wizReset() {
  wizState.topic = '';
  wizState.clarificationQuestion = '';
  wizState.clarificationAnswer = '';
  wizState.keywordSet = null;
  wizState.rssSuggestions = [];
  wizState.selectedCoreKeywords = new Set();
  wizState.selectedRssUrls = new Set();
}

function wizLoading(step, msg) {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${obSteps(step)}
      <div class="wizard-loading">
        <div class="wizard-spinner"></div>
        <p class="wizard-subtitle" style="margin-top:18px">${escOb(msg)}</p>
      </div>
    </div>`;
}

// ─── Step 1: 주제 입력 ────────────────────────────────────────────────────────

function showOnboardingWizard() {
  wizReset();
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${OB_LOGO}
      ${obSteps(1)}
      <h2 class="wizard-title">PigeonBrief에 오신 걸 환영해요!</h2>
      <p class="wizard-subtitle">관심 있는 뉴스 주제를 자유롭게 적어주세요.<br>AI가 알아서 키워드와 추천 소스를 골라드려요.</p>
      <div class="wizard-field">
        <label class="wizard-label">관심 주제</label>
        <textarea id="ob-topic" class="wizard-input wizard-textarea"
          rows="4"
          placeholder="예: Ubcare처럼 EPIC을 지향하는 의료 소프트웨어 산업 동향"></textarea>
      </div>
      <div id="ob1-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions">
        <button id="ob1-btn" class="btn-primary" onclick="obStep1Submit()">AI에게 물어보기 →</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('ob-topic')?.focus(), 80);
}

async function obStep1Submit() {
  const topic = document.getElementById('ob-topic')?.value.trim();
  const errEl = document.getElementById('ob1-error');
  if (!topic || topic.length < 2) {
    errEl.textContent = '주제를 2글자 이상 입력해 주세요.';
    errEl.style.display = '';
    return;
  }
  wizState.topic = topic;
  wizLoading(2, 'AI가 주제를 분석하고 있어요...');
  try {
    const result = await pbApi('POST', '/api/ai/interpret', { topic });
    const data = result.data || result;
    if (data.needs_clarification && data.clarification_question) {
      wizState.clarificationQuestion = data.clarification_question;
      obStep2Clarify();
    } else {
      // 곧바로 키워드 제안으로
      obFetchKeywords();
    }
  } catch(e) {
    obShowError(1, 'AI 분석 실패: ' + e.message, showOnboardingWizard);
  }
}

// ─── Step 2: 되묻기 ───────────────────────────────────────────────────────────

function obStep2Clarify() {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${obSteps(2)}
      <h2 class="wizard-title">조금만 더 알려주세요</h2>
      <p class="wizard-subtitle">주제를 더 정확히 파악하려고 해요.</p>
      <div class="wizard-ai-question">
        💬 ${escOb(wizState.clarificationQuestion)}
      </div>
      <div class="wizard-field">
        <textarea id="ob-clarify" class="wizard-input wizard-textarea" rows="3"
          placeholder="짧게 답해주세요 (건너뛰어도 돼요)"></textarea>
      </div>
      <div id="ob2-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions wizard-actions-2">
        <button class="wizard-btn-skip" onclick="obFetchKeywords()">건너뛰기</button>
        <button class="btn-primary" onclick="obSubmitClarify()">다음 →</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('ob-clarify')?.focus(), 80);
}

function obSubmitClarify() {
  wizState.clarificationAnswer = document.getElementById('ob-clarify')?.value.trim() || '';
  obFetchKeywords();
}

// ─── Step 3: 키워드 + RSS 추천 ────────────────────────────────────────────────

async function obFetchKeywords() {
  wizLoading(3, 'AI가 키워드와 추천 매체를 고르고 있어요... (최대 20초)');
  try {
    const result = await pbApi('POST', '/api/ai/suggest-keywords', {
      topic: wizState.topic,
      clarification_answer: wizState.clarificationAnswer,
    });
    wizState.keywordSet = result.data;
    wizState.rssSuggestions = result.rss_suggestions || [];
    // 기본값: 모든 core keyword + top 3 RSS 선택
    wizState.selectedCoreKeywords = new Set(wizState.keywordSet.core_keywords || []);
    wizState.selectedRssUrls = new Set(wizState.rssSuggestions.slice(0, 3).map(r => r.url));
    obStep3Render();
  } catch(e) {
    obShowError(3, 'AI 키워드 추천 실패: ' + e.message, showOnboardingWizard);
  }
}

function obStep3Render() {
  const ks = wizState.keywordSet || {};
  const core = ks.core_keywords || [];
  const entities = ks.related_entities || [];
  const concepts = ks.related_concepts || [];
  const exclude = ks.exclude_keywords || [];
  const recQuery = ks.recommended_query || '';

  const chip = (label, selected, action) =>
    `<span class="wiz-chip ${selected ? 'selected' : ''}" onclick="${action}">${escOb(label)}</span>`;

  const coreChips = core.map(k =>
    chip(k, wizState.selectedCoreKeywords.has(k), `obToggleCore('${escJs(k)}')`)
  ).join('');

  const entityChips = entities.map(k => `<span class="wiz-chip wiz-chip-info">${escOb(k)}</span>`).join('');
  const conceptChips = concepts.map(k => `<span class="wiz-chip wiz-chip-info">${escOb(k)}</span>`).join('');
  const excludeChips = exclude.map(k => `<span class="wiz-chip wiz-chip-exclude">− ${escOb(k)}</span>`).join('');

  const rssItems = wizState.rssSuggestions.map((r, i) => `
    <label class="wiz-rss-item">
      <input type="checkbox" ${wizState.selectedRssUrls.has(r.url) ? 'checked' : ''}
        onchange="obToggleRss('${escJs(r.url)}')" />
      <div class="wiz-rss-info">
        <div class="wiz-rss-name">${escOb(r.name)} <span class="wiz-rss-lang">${escOb(r.language || '')}</span></div>
        <div class="wiz-rss-cat">${(r.categories || []).slice(0, 3).map(escOb).join(' · ')}</div>
      </div>
    </label>`).join('');

  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap wizard-wrap-wide">
      ${obSteps(3)}
      <h2 class="wizard-title">AI가 이렇게 정리했어요</h2>
      <p class="wizard-subtitle">마음에 안 드는 부분은 AI에게 수정 요청할 수 있어요.</p>

      <div class="wiz-section">
        <div class="wiz-section-title">🎯 핵심 키워드 <span class="wiz-hint">(클릭해서 선택/해제)</span></div>
        <div class="wiz-chips">${coreChips || '<span class="wiz-empty">없음</span>'}</div>
      </div>

      ${entityChips ? `<div class="wiz-section">
        <div class="wiz-section-title">🏢 연관 고유명사</div>
        <div class="wiz-chips">${entityChips}</div>
      </div>` : ''}

      ${conceptChips ? `<div class="wiz-section">
        <div class="wiz-section-title">💡 연관 개념</div>
        <div class="wiz-chips">${conceptChips}</div>
      </div>` : ''}

      ${excludeChips ? `<div class="wiz-section">
        <div class="wiz-section-title">🚫 제외 키워드</div>
        <div class="wiz-chips">${excludeChips}</div>
      </div>` : ''}

      <div class="wiz-section">
        <div class="wiz-section-title">🔍 추천 검색어</div>
        <code class="wiz-query">${escOb(recQuery) || '—'}</code>
      </div>

      <div class="wiz-section">
        <div class="wiz-section-title">📡 추천 뉴스 매체 <span class="wiz-hint">(상위 ${wizState.rssSuggestions.length}개)</span></div>
        <div class="wiz-rss-list">${rssItems || '<span class="wiz-empty">추천 매체 없음</span>'}</div>
      </div>

      <div class="wiz-ai-edit">
        <label class="wizard-label">✨ AI에게 수정 요청</label>
        <div class="wizard-field-row">
          <input id="ob-edit-inst" class="wizard-input"
            placeholder="예: OpenAI 관련 키워드 추가해줘 / 일반 AI 뉴스 제외"
            onkeydown="if(event.key==='Enter') obAiEdit()" />
          <button class="btn-secondary" onclick="obAiEdit()">수정</button>
        </div>
      </div>

      <div id="ob3-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions wizard-actions-2">
        <button class="wizard-btn-skip" onclick="showOnboardingWizard()">← 처음으로</button>
        <button class="btn-primary" onclick="obStep4Preview()">미리보기 →</button>
      </div>
    </div>`;
}

function obToggleCore(kw) {
  if (wizState.selectedCoreKeywords.has(kw)) wizState.selectedCoreKeywords.delete(kw);
  else wizState.selectedCoreKeywords.add(kw);
  obStep3Render();
}

function obToggleRss(url) {
  if (wizState.selectedRssUrls.has(url)) wizState.selectedRssUrls.delete(url);
  else wizState.selectedRssUrls.add(url);
}

async function obAiEdit() {
  const instruction = document.getElementById('ob-edit-inst')?.value.trim();
  if (!instruction) return;
  const errEl = document.getElementById('ob3-error');
  errEl.style.display = 'none';
  wizLoading(3, 'AI가 수정하고 있어요...');
  try {
    const result = await pbApi('POST', '/api/ai/edit-keywords', {
      current: wizState.keywordSet,
      instruction,
    });
    wizState.keywordSet = result.data;
    wizState.rssSuggestions = result.rss_suggestions || wizState.rssSuggestions;
    wizState.selectedCoreKeywords = new Set(wizState.keywordSet.core_keywords || []);
    // RSS 선택은 유지하되 존재하는 것만
    const valid = new Set(wizState.rssSuggestions.map(r => r.url));
    wizState.selectedRssUrls = new Set([...wizState.selectedRssUrls].filter(u => valid.has(u)));
    if (wizState.selectedRssUrls.size === 0) {
      wizState.selectedRssUrls = new Set(wizState.rssSuggestions.slice(0, 3).map(r => r.url));
    }
    obStep3Render();
  } catch(e) {
    obStep3Render();
    const err = document.getElementById('ob3-error');
    if (err) { err.textContent = 'AI 수정 실패: ' + e.message; err.style.display = ''; }
  }
}

// ─── Step 4: 미리보기 ─────────────────────────────────────────────────────────

async function obStep4Preview() {
  wizLoading(4, '샘플 뉴스를 수집하고 요약하고 있어요... (최대 90초)');
  const rssUrls = [...wizState.selectedRssUrls];
  try {
    const result = await pbApi('POST', '/api/ai/preview', {
      keywords: wizState.keywordSet,
      rss_urls: rssUrls,
      max_articles: 3,
    });
    obStep4Render(result);
  } catch(e) {
    obStep4Render({ status: 'error', message: e.message, articles: [] });
  }
}

function obStep4Render(result) {
  const articles = result.articles || [];
  const notice = result.status === 'not_implemented'
    ? `<div class="wiz-preview-notice">🛠️ 미리보기는 곧 지원 예정이에요. 아래는 선택 결과 요약입니다.</div>`
    : '';

  const articleHtml = articles.length
    ? articles.map(a => `
        <div class="wiz-preview-card">
          <div class="wiz-preview-meta">${escOb(a.source_name || '')}</div>
          <div class="wiz-preview-title">${escOb(a.title || '')}</div>
          <div class="wiz-preview-summary">${escOb((a.summary_ko || '').slice(0, 200))}</div>
        </div>`).join('')
    : `<div class="wiz-preview-summary-box">
        <div><strong>주제:</strong> ${escOb(wizState.topic)}</div>
        <div><strong>핵심 키워드:</strong> ${[...wizState.selectedCoreKeywords].map(escOb).join(', ') || '—'}</div>
        <div><strong>검색어:</strong> <code>${escOb(wizState.keywordSet?.recommended_query || '')}</code></div>
        <div><strong>선택 매체 (${wizState.selectedRssUrls.size}):</strong> ${wizState.rssSuggestions.filter(r => wizState.selectedRssUrls.has(r.url)).map(r => escOb(r.name)).join(', ') || '—'}</div>
      </div>`;

  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap wizard-wrap-wide">
      ${obSteps(4)}
      <h2 class="wizard-title">이렇게 구독해볼까요?</h2>
      <p class="wizard-subtitle">확인한 뒤 저장하면 오늘 밤부터 수집돼요.</p>
      ${notice}
      <div class="wiz-preview-list">${articleHtml}</div>
      <div class="wizard-field">
        <label class="wizard-label">주제 이름 (저장용)</label>
        <input id="ob-final-name" class="wizard-input"
          value="${escOb((wizState.topic || '').slice(0, 40))}" maxlength="60" />
      </div>
      <div id="ob4-error" class="wizard-error" style="display:none"></div>
      <div class="wizard-actions wizard-actions-2">
        <button class="wizard-btn-skip" onclick="obStep3Render()">← 수정하기</button>
        <button id="ob4-save-btn" class="btn-primary" onclick="obSaveAll()">저장하고 시작 →</button>
      </div>
    </div>`;
}

// ─── Step 5: 저장 ─────────────────────────────────────────────────────────────

async function obSaveAll() {
  const name = document.getElementById('ob-final-name')?.value.trim() || wizState.topic.slice(0, 40);
  const errEl = document.getElementById('ob4-error');
  const btn = document.getElementById('ob4-save-btn');
  btn.disabled = true; btn.textContent = '저장 중...';
  errEl.style.display = 'none';

  try {
    // 1. 섹션 생성
    const section = await pbApi('POST', '/api/settings/sections', {
      name,
      description: wizState.topic,
    });
    const sectionId = section.id;

    // 2. 선택된 RSS 일괄 등록
    for (const r of wizState.rssSuggestions) {
      if (!wizState.selectedRssUrls.has(r.url)) continue;
      try {
        await pbApi('POST', '/api/settings/rss', { section_id: sectionId, url: r.url, name: r.name });
      } catch(e) { console.warn('RSS 등록 실패:', r.name, e); }
    }

    // 3. 검색어 등록 (recommended_query 우선, 없으면 선택된 core 키워드 조합)
    const recQuery = wizState.keywordSet?.recommended_query || '';
    const queries = [];
    if (recQuery) queries.push(recQuery);
    const coreList = [...wizState.selectedCoreKeywords];
    if (!recQuery && coreList.length) queries.push(coreList.join(' OR '));

    for (const q of queries) {
      try {
        await pbApi('POST', '/api/settings/keywords', { section_id: sectionId, query: q });
      } catch(e) { console.warn('키워드 등록 실패:', q, e); }
    }

    obStep5Complete(name);
  } catch(e) {
    errEl.textContent = '저장 실패: ' + e.message;
    errEl.style.display = '';
    btn.disabled = false; btn.textContent = '저장하고 시작 →';
  }
}

function obStep5Complete(sectionName) {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap wizard-complete">
      ${obSteps(5)}
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

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function escJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function obShowError(step, msg, retryFn) {
  document.getElementById('card-grid').innerHTML = `
    <div class="wizard-wrap">
      ${obSteps(step)}
      <div class="wizard-complete-icon">⚠️</div>
      <h2 class="wizard-title">오류가 발생했어요</h2>
      <p class="wizard-subtitle">${escOb(msg)}</p>
      <div class="wizard-actions">
        <button class="btn-primary" onclick="(${retryFn.name})()">다시 시도</button>
      </div>
    </div>`;
}
