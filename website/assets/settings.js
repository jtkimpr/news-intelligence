/**
 * settings.js — 섹션/RSS/키워드 관리 UI
 * 인증: SHA-256 비밀번호 (site_config.json 비교)
 * 저장: GitHub API로 config/sections.json 커밋
 */

let siteConfig = null;    // site_config.json
let sectionsData = null;  // config/sections.json (GitHub에서 로드)
let currentSha = null;    // GitHub API용 파일 SHA

// ─── 진입점 ──────────────────────────────────────────────────────────────────

async function openSettings() {
  const panel = document.getElementById('settings-panel');
  panel.style.display = 'flex';

  if (!siteConfig) {
    try {
      const res = await fetch('data/site_config.json?_=' + Date.now());
      siteConfig = await res.json();
    } catch (e) {
      showSettingsError('site_config.json 로드 실패: ' + e.message);
      return;
    }
  }

  if (!isAuthenticated()) {
    showAuthScreen();
  } else {
    await showMainSettings();
  }
}

function closeSettings() {
  document.getElementById('settings-panel').style.display = 'none';
}

// ─── 인증 ──────────────────────────────────────────────────────────────────

function isAuthenticated() {
  return sessionStorage.getItem('settings_auth') === 'ok';
}

function showAuthScreen() {
  const body = document.getElementById('settings-body');
  body.innerHTML = `
    <div class="settings-auth">
      <div class="settings-auth-icon">🔐</div>
      <h2>설정 접근</h2>
      <p>비밀번호를 입력하세요</p>
      <input type="password" id="auth-password" placeholder="비밀번호"
        onkeydown="if(event.key==='Enter') submitAuth()" autofocus />
      <button class="btn-primary" onclick="submitAuth()">확인</button>
      <div id="auth-error" class="settings-error" style="display:none"></div>
    </div>
  `;
  setTimeout(() => document.getElementById('auth-password')?.focus(), 100);
}

async function submitAuth() {
  const input = document.getElementById('auth-password').value;
  const hash = await sha256(input);
  if (hash === siteConfig.password_hash) {
    sessionStorage.setItem('settings_auth', 'ok');
    await showMainSettings();
  } else {
    const err = document.getElementById('auth-error');
    err.textContent = '비밀번호가 틀렸습니다.';
    err.style.display = 'block';
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── GitHub PAT ───────────────────────────────────────────────────────────

function getStoredPat() {
  return localStorage.getItem('github_pat') || '';
}

function savePat(pat) {
  if (pat) localStorage.setItem('github_pat', pat);
  else localStorage.removeItem('github_pat');
}

// ─── 메인 설정 화면 ──────────────────────────────────────────────────────────

async function showMainSettings() {
  const body = document.getElementById('settings-body');
  body.innerHTML = '<div class="settings-loading">설정 불러오는 중...</div>';

  try {
    await loadSectionsFromGitHub();
  } catch (e) {
    // PAT 없거나 오류 시 PAT 입력 화면
    showPatScreen(e.message);
    return;
  }

  renderSettingsUI();
}

async function loadSectionsFromGitHub() {
  const pat = getStoredPat();
  if (!pat) throw new Error('GitHub PAT가 설정되지 않았습니다.');

  const { github_repo, github_branch, config_path } = siteConfig;
  const url = `https://api.github.com/repos/${github_repo}/contents/${config_path}?ref=${github_branch}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
    }
  });

  if (res.status === 401 || res.status === 403) throw new Error('GitHub PAT 권한 오류 (repo 읽기/쓰기 필요)');
  if (!res.ok) throw new Error(`GitHub API 오류: ${res.status}`);

  const data = await res.json();
  currentSha = data.sha;
  sectionsData = JSON.parse(atob(data.content.replace(/\n/g, '')));
}

function showPatScreen(errorMsg) {
  const body = document.getElementById('settings-body');
  const existing = getStoredPat();
  body.innerHTML = `
    <div class="settings-auth">
      <div class="settings-auth-icon">🔑</div>
      <h2>GitHub Personal Access Token</h2>
      <p>설정을 저장하려면 GitHub PAT가 필요합니다.<br>
         <small>repo 권한이 있는 Classic PAT 또는 Fine-grained PAT</small></p>
      <input type="password" id="pat-input" placeholder="ghp_..."
        value="${existing}"
        onkeydown="if(event.key==='Enter') submitPat()" autofocus />
      <button class="btn-primary" onclick="submitPat()">연결</button>
      ${errorMsg ? `<div class="settings-error">${errorMsg}</div>` : ''}
    </div>
  `;
  setTimeout(() => document.getElementById('pat-input')?.focus(), 100);
}

async function submitPat() {
  const pat = document.getElementById('pat-input').value.trim();
  if (!pat) return;
  savePat(pat);
  await showMainSettings();
}

// ─── 설정 UI 렌더링 ──────────────────────────────────────────────────────────

function renderSettingsUI() {
  const body = document.getElementById('settings-body');
  const sections = sectionsData.sections || [];

  body.innerHTML = `
    <div class="settings-toolbar">
      <span class="settings-repo-label">
        ${siteConfig.github_repo} / ${siteConfig.github_branch}
      </span>
      <button class="btn-small btn-secondary" onclick="showPatScreen('')">PAT 변경</button>
      <button class="btn-small btn-secondary" onclick="sessionStorage.removeItem('settings_auth'); closeSettings()">로그아웃</button>
    </div>

    <div id="sections-list">
      ${sections.map((sec, i) => renderSection(sec, i)).join('')}
    </div>

    <div class="settings-add-section">
      <button class="btn-add-section" onclick="addSection()">+ 섹션 추가</button>
    </div>

    <div class="settings-footer">
      <div id="save-status"></div>
      <button class="btn-primary btn-save" onclick="saveToGitHub()">GitHub에 저장</button>
    </div>
  `;
}

function renderSection(sec, idx) {
  const rssHtml = (sec.channel2_rss?.sources || []).map((s, si) => `
    <div class="rss-row" data-sec="${idx}" data-rss="${si}">
      <input class="rss-name" type="text" value="${escHtml(s.name)}" placeholder="소스 이름"
        oninput="updateRssName(${idx},${si},this.value)" />
      <input class="rss-url" type="text" value="${escHtml(s.url)}" placeholder="https://..."
        oninput="updateRssUrl(${idx},${si},this.value)" />
      <button class="btn-icon" onclick="removeRss(${idx},${si})" title="삭제">✕</button>
    </div>
  `).join('');

  const kwHtml = (sec.channel3_keywords?.queries || []).map((q, qi) => `
    <div class="kw-row" data-sec="${idx}" data-kw="${qi}">
      <input class="kw-input" type="text" value="${escHtml(q)}" placeholder="검색 키워드"
        oninput="updateKeyword(${idx},${qi},this.value)" />
      <button class="btn-icon" onclick="removeKeyword(${idx},${qi})" title="삭제">✕</button>
    </div>
  `).join('');

  return `
    <div class="section-card" id="sec-card-${idx}">
      <div class="section-card-header">
        <div class="section-card-title-row">
          <input class="sec-name-input" type="text" value="${escHtml(sec.name)}"
            placeholder="섹션 이름" oninput="updateSectionName(${idx},this.value)" />
          <label class="toggle-label">
            <input type="checkbox" ${sec.enabled !== false ? 'checked' : ''}
              onchange="updateSectionEnabled(${idx},this.checked)" />
            활성
          </label>
        </div>
        <div class="section-card-actions">
          <button class="btn-icon" onclick="moveSectionUp(${idx})" title="위로" ${idx===0?'disabled':''}>↑</button>
          <button class="btn-icon" onclick="moveSectionDown(${idx})" title="아래로"
            ${idx===(sectionsData.sections.length-1)?'disabled':''}>↓</button>
          <button class="btn-icon btn-danger" onclick="removeSection(${idx})" title="섹션 삭제">🗑</button>
        </div>
      </div>

      <div class="section-card-desc">
        <input type="text" value="${escHtml(sec.description||'')}" placeholder="설명 (선택)"
          oninput="updateSectionDesc(${idx},this.value)" />
      </div>

      <div class="section-block">
        <div class="section-block-title">
          채널2 RSS 소스
          <button class="btn-small btn-secondary" onclick="addRss(${idx})">+ 추가</button>
        </div>
        <div id="rss-list-${idx}">${rssHtml || '<div class="empty-hint">RSS 소스 없음</div>'}</div>
      </div>

      <div class="section-block">
        <div class="section-block-title">
          채널3 키워드
          <span class="kw-hint">AND·OR·NOT 사용 가능 (예: "AI agent" -spam OR automation)</span>
          <button class="btn-small btn-secondary" onclick="addKeyword(${idx})">+ 추가</button>
        </div>
        <div id="kw-list-${idx}">${kwHtml || '<div class="empty-hint">키워드 없음</div>'}</div>
      </div>
    </div>
  `;
}

// ─── 데이터 조작 함수들 ──────────────────────────────────────────────────────

function updateSectionName(idx, val) {
  sectionsData.sections[idx].name = val;
}
function updateSectionDesc(idx, val) {
  sectionsData.sections[idx].description = val;
}
function updateSectionEnabled(idx, val) {
  sectionsData.sections[idx].enabled = val;
}

function addSection() {
  const id = 'section-' + Date.now();
  sectionsData.sections.push({
    id,
    name: '새 섹션',
    description: '',
    enabled: true,
    channel2_rss: { sources: [] },
    channel3_keywords: { max_age_hours: 72, queries: [] }
  });
  renderSettingsUI();
  // 새 섹션으로 스크롤
  setTimeout(() => {
    const last = document.querySelectorAll('.section-card');
    last[last.length - 1]?.scrollIntoView({ behavior: 'smooth' });
  }, 50);
}

function removeSection(idx) {
  if (!confirm(`"${sectionsData.sections[idx].name}" 섹션을 삭제하시겠습니까?`)) return;
  sectionsData.sections.splice(idx, 1);
  renderSettingsUI();
}

function moveSectionUp(idx) {
  if (idx === 0) return;
  const arr = sectionsData.sections;
  [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
  renderSettingsUI();
}

function moveSectionDown(idx) {
  const arr = sectionsData.sections;
  if (idx === arr.length - 1) return;
  [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
  renderSettingsUI();
}

function updateRssName(secIdx, rssIdx, val) {
  sectionsData.sections[secIdx].channel2_rss.sources[rssIdx].name = val;
}
function updateRssUrl(secIdx, rssIdx, val) {
  sectionsData.sections[secIdx].channel2_rss.sources[rssIdx].url = val;
}

function addRss(secIdx) {
  const sec = sectionsData.sections[secIdx];
  if (!sec.channel2_rss) sec.channel2_rss = { sources: [] };
  sec.channel2_rss.sources.push({ name: '', url: '' });
  rerenderSection(secIdx);
}

function removeRss(secIdx, rssIdx) {
  sectionsData.sections[secIdx].channel2_rss.sources.splice(rssIdx, 1);
  rerenderSection(secIdx);
}

function updateKeyword(secIdx, kwIdx, val) {
  sectionsData.sections[secIdx].channel3_keywords.queries[kwIdx] = val;
}

function addKeyword(secIdx) {
  const sec = sectionsData.sections[secIdx];
  if (!sec.channel3_keywords) sec.channel3_keywords = { max_age_hours: 72, queries: [] };
  sec.channel3_keywords.queries.push('');
  rerenderSection(secIdx);
}

function removeKeyword(secIdx, kwIdx) {
  sectionsData.sections[secIdx].channel3_keywords.queries.splice(kwIdx, 1);
  rerenderSection(secIdx);
}

function rerenderSection(secIdx) {
  const card = document.getElementById(`sec-card-${secIdx}`);
  if (!card) return;
  const sec = sectionsData.sections[secIdx];
  card.outerHTML = renderSection(sec, secIdx);
}

// ─── GitHub 저장 ─────────────────────────────────────────────────────────────

async function saveToGitHub() {
  const btn = document.querySelector('.btn-save');
  const status = document.getElementById('save-status');

  btn.disabled = true;
  btn.textContent = '저장 중...';
  status.textContent = '';

  try {
    const pat = getStoredPat();
    if (!pat) throw new Error('GitHub PAT 없음');

    const { github_repo, github_branch, config_path } = siteConfig;
    const content = JSON.stringify(sectionsData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(content)));

    const now = new Date().toISOString().slice(0, 10);
    const body = {
      message: `settings update: ${now}`,
      content: contentB64,
      branch: github_branch,
      sha: currentSha,
    };

    const res = await fetch(
      `https://api.github.com/repos/${github_repo}/contents/${config_path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const result = await res.json();
    currentSha = result.content.sha;

    status.textContent = '저장 완료! 다음 파이프라인 실행 시 반영됩니다.';
    status.className = 'save-ok';
  } catch (e) {
    status.textContent = '저장 실패: ' + e.message;
    status.className = 'save-error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'GitHub에 저장';
  }
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showSettingsError(msg) {
  const body = document.getElementById('settings-body');
  body.innerHTML = `<div class="settings-error">${msg}</div>`;
}

// 패널 외부 클릭 시 닫기
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('settings-panel')?.addEventListener('click', e => {
    if (e.target.id === 'settings-panel') closeSettings();
  });
});
