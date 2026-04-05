let allData = null;
let activeSection = 'all';

// ─── localStorage 키 ──────────────────────────────────────────────────────────
const LS_LIKED       = 'ni_liked';       // {id: articleData} — 좋아요한 기사 전체 데이터
const LS_DELETED     = 'ni_deleted';     // [id, ...] — 삭제한 기사 ID 목록
const LS_READ_LATER  = 'ni_read_later';  // {id: articleData} — 나중에 읽기

function getLiked()     { return JSON.parse(localStorage.getItem(LS_LIKED)      || '{}'); }
function getDeleted()   { return JSON.parse(localStorage.getItem(LS_DELETED)    || '[]'); }
function getReadLater() { return JSON.parse(localStorage.getItem(LS_READ_LATER) || '{}'); }

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadData() {
  const res = await fetch('data/articles.json?_=' + Date.now());
  allData = await res.json();
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

  // 고정 탭: Today, 전체
  addTab(nav, 'today',      'Today',      activeSection === 'today');
  addTab(nav, 'all',        '전체',        activeSection === 'all');

  // 동적 섹션 탭
  (allData.sections || []).forEach(sec => {
    addTab(nav, sec.id, sec.name, activeSection === sec.id);
  });

  // 고정 탭: Read Later
  addTab(nav, 'read-later', 'Read Later', activeSection === 'read-later');

  nav.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeSection = tab.dataset.section;
    render();
  });
}

function addTab(nav, id, label, isActive) {
  const btn = document.createElement('button');
  btn.className = 'tab' + (isActive ? ' active' : '');
  btn.dataset.section = id;
  btn.textContent = label;
  nav.appendChild(btn);
}

// ─── 렌더링 ───────────────────────────────────────────────────────────────────

function render() {
  const grid = document.getElementById('card-grid');
  const deleted = new Set(getDeleted());

  if (activeSection === 'today') {
    const articles = getTodayArticles().filter(a => !deleted.has(a.id));
    grid.innerHTML = articles.length
      ? articles.map(a => makeCard(a)).join('')
      : '<div class="empty-state">오늘 수집된 기사가 없습니다.</div>';

  } else if (activeSection === 'read-later') {
    const articles = getReadLaterArticles().filter(a => !deleted.has(a.id));
    grid.innerHTML = articles.length
      ? articles.map(a => makeCard(a)).join('')
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
      return `<div class="section-header">${sec.name}</div>` + arts.map(a => makeCard(a)).join('');
    }).join('');

  } else {
    const sec = (allData?.sections || []).find(s => s.id === activeSection);
    const articles = (sec?.articles || []).filter(a => !deleted.has(a.id));
    grid.innerHTML = articles.length
      ? articles.map(a => makeCard(a)).join('')
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
  // 현재 articles.json에 있으면 최신 데이터 우선
  const currentById = {};
  (allData?.sections || []).forEach(s =>
    (s.articles || []).forEach(a => { currentById[a.id] = a; })
  );
  return Object.keys(saved).map(id => currentById[id] || saved[id]);
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
  const liked     = getLiked();
  const readLater = getReadLater();
  const isLiked   = !!liked[article.id];
  const isRL      = !!readLater[article.id];

  return `
    <div class="card" id="card-${article.id}">
      <div class="card-meta">
        <span class="card-source">${article.source_name || ''}</span>
        <span class="card-time">${timeAgo(article.published_at)}</span>
      </div>
      <div class="card-title">${article.title}</div>
      <div class="card-summary">${article.summary_ko || ''}</div>
      <div class="card-footer">
        <a class="card-link" href="${article.url}" target="_blank" rel="noopener">원문 보기 →</a>
        <div class="card-actions">
          <button class="action-btn ${isLiked ? 'active-like' : ''}"
            onclick="toggleLike(${JSON.stringify(JSON.stringify(article))})"
            title="${isLiked ? '좋아요 취소' : '좋아요'}">♡</button>
          <button class="action-btn ${isRL ? 'active-rl' : ''}"
            onclick="toggleReadLater(${JSON.stringify(JSON.stringify(article))})"
            title="${isRL ? 'Read Later 취소' : '나중에 읽기'}">🔖</button>
          <button class="action-btn action-delete"
            onclick="deleteArticle('${article.id}')"
            title="삭제">✕</button>
        </div>
      </div>
    </div>`;
}

// ─── 카드 액션 ────────────────────────────────────────────────────────────────

function toggleLike(articleJson) {
  const article = JSON.parse(articleJson);
  const liked = getLiked();
  if (liked[article.id]) {
    delete liked[article.id];
  } else {
    liked[article.id] = article;
  }
  localStorage.setItem(LS_LIKED, JSON.stringify(liked));
  refreshCard(article.id);
}

function toggleReadLater(articleJson) {
  const article = JSON.parse(articleJson);
  const rl = getReadLater();
  if (rl[article.id]) {
    delete rl[article.id];
  } else {
    rl[article.id] = article;
  }
  localStorage.setItem(LS_READ_LATER, JSON.stringify(rl));
  refreshCard(article.id);
  // Read Later 탭에서 삭제 취소 시 즉시 재렌더
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

  // 즉시 카드 제거
  const card = document.getElementById('card-' + id);
  if (card) card.remove();
}

function refreshCard(id) {
  // 해당 기사를 articles.json 또는 liked에서 찾아 카드만 교체
  const currentById = {};
  (allData?.sections || []).forEach(s =>
    (s.articles || []).forEach(a => { currentById[a.id] = a; })
  );
  const liked = getLiked();
  const article = currentById[id] || liked[id];
  if (!article) return;

  const card = document.getElementById('card-' + id);
  if (card) card.outerHTML = makeCard(article);
}

loadData();
