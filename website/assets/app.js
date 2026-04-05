let allData = null;
let activeSection = 'all';
const articlesById = {};   // id → article 조회용 맵

// ─── localStorage 키 ──────────────────────────────────────────────────────────
const LS_LIKED      = 'ni_liked';       // {id: articleData}
const LS_DELETED    = 'ni_deleted';     // [id, ...]
const LS_READ_LATER = 'ni_read_later';  // {id: articleData}

function getLiked()     { return JSON.parse(localStorage.getItem(LS_LIKED)      || '{}'); }
function getDeleted()   { return JSON.parse(localStorage.getItem(LS_DELETED)    || '[]'); }
function getReadLater() { return JSON.parse(localStorage.getItem(LS_READ_LATER) || '{}'); }

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadData() {
  const res = await fetch('data/articles.json?_=' + Date.now());
  allData = await res.json();

  // articlesById 맵 구성
  (allData.sections || []).forEach(sec =>
    (sec.articles || []).forEach(a => { articlesById[a.id] = a; })
  );

  buildTabs();
  render();

  if (allData.generated_at) {
    const d = new Date(allData.generated_at);
    document.getElementById('generated-at').textContent =
      `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} 업데이트`;
  }
}

// ─── 탭 빌드 ─────────────────────────────────────────────────────────────────

function buildTabs() {
  const nav = document.getElementById('section-tabs');
  nav.innerHTML = '';

  addTab(nav, 'today',       'Today');
  addTab(nav, 'all',         '전체');
  (allData.sections || []).forEach(sec => addTab(nav, sec.id, sec.name));
  addTab(nav, 'read-later',  'Read Later');

  // 기본 활성 탭
  nav.querySelector('[data-section="today"]').classList.add('active');
  activeSection = 'today';

  nav.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    nav.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeSection = tab.dataset.section;
    render();
  });
}

function addTab(nav, id, label) {
  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.section = id;
  btn.textContent = label;
  nav.appendChild(btn);
}

// ─── 렌더링 ───────────────────────────────────────────────────────────────────

function render() {
  const grid = document.getElementById('card-grid');
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
      : '<div class="empty-state">나중에 읽기로 저장된 기사가 없습니다.</div>';

  } else if (activeSection === 'all') {
    const sections = allData?.sections || [];
    if (!sections.length) {
      grid.innerHTML = '<div class="empty-state">아직 수집된 기사가 없습니다.</div>';
      return;
    }
    grid.innerHTML = sections.map(sec => {
      const arts = (sec.articles || []).filter(a => !deleted.has(a.id));
      if (!arts.length) return '';
      return `<div class="section-header">${sec.name}</div>` + arts.map(makeCard).join('');
    }).join('');

  } else {
    const sec = (allData?.sections || []).find(s => s.id === activeSection);
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

  return `
    <div class="card" id="card-${id}">
      <div class="card-meta">
        <span class="card-source">${article.source_name || ''}</span>
        <span class="card-time">${timeAgo(article.published_at)}</span>
      </div>
      <a class="card-title-link" href="${article.url}" target="_blank" rel="noopener">
        <div class="card-title">${article.title}</div>
      </a>
      <div class="card-summary">${article.summary_ko || ''}</div>
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
        <a class="card-link" href="${article.url}" target="_blank" rel="noopener">원문 보기 →</a>
      </div>
    </div>`;
}

// ─── 카드 액션 (이벤트 위임) ─────────────────────────────────────────────────

document.getElementById('card-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.preventDefault();
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  if (action === 'like')        toggleLike(id);
  else if (action === 'read-later') toggleReadLater(id);
  else if (action === 'delete') deleteArticle(id);
});

function toggleLike(id) {
  const liked = getLiked();
  if (liked[id]) {
    delete liked[id];
  } else {
    const article = articlesById[id] || getReadLater()[id];
    if (article) liked[id] = article;
  }
  localStorage.setItem(LS_LIKED, JSON.stringify(liked));
  refreshCard(id);
}

function toggleReadLater(id) {
  const rl = getReadLater();
  if (rl[id]) {
    delete rl[id];
  } else {
    const article = articlesById[id];
    if (article) rl[id] = article;
  }
  localStorage.setItem(LS_READ_LATER, JSON.stringify(rl));
  refreshCard(id);
  if (activeSection === 'read-later') render();
}

function deleteArticle(id) {
  const deleted = getDeleted();
  if (!deleted.includes(id)) deleted.push(id);
  localStorage.setItem(LS_DELETED, JSON.stringify(deleted));

  // 좋아요/나중에읽기에서도 제거
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

loadData();
