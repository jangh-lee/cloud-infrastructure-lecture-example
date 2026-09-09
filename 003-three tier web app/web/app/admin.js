(() => {
  const $ = (id) => document.getElementById(id);
  const labels = { announce: '사전 공지', maintenance: '점검 시작', normal: '공지 종료 / 점검 해제' };
  let currentUser = null;
  let csrfToken = null;
  let authMode = 'login';

  function setSession(data) {
    currentUser = data.user || null;
    csrfToken = data.csrfToken || null;
    $('accountName').textContent = currentUser ? `${currentUser.displayName} 님` : '';
    $('accountName').hidden = !currentUser;
    $('memberLoginButton').hidden = Boolean(currentUser);
    $('logoutButton').hidden = !currentUser;
    $('adminLoginButton').textContent = currentUser?.role === 'admin' ? '공지 관리' : '관리자 로그인';
  }

  async function api(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'board', 'X-CSRF-Token': csrfToken || '' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
      });
      const data = response.status === 204 ? null : await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && !url.endsWith('/login')) setSession({});
        throw new Error(data?.message || '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function openAuth(mode) {
    authMode = mode;
    const register = mode === 'register';
    $('authForm').reset();
    $('authHeading').textContent = mode === 'admin' ? '관리자 로그인' : register ? '회원 가입' : '로그인';
    $('authDescription').textContent = mode === 'admin' ? '관리자 계정으로 공지사항을 작성하고 점검을 안내하세요.' : register ? '회원 가입 후에도 게시글은 기존처럼 자유롭게 이용할 수 있습니다.' : '회원 계정으로 로그인해 주세요.';
    $('displayNameField').hidden = !register;
    $('displayNameInput').required = register;
    $('passwordInput').minLength = register ? 10 : 1;
    $('passwordInput').autocomplete = register ? 'new-password' : 'current-password';
    $('passwordInput').placeholder = register ? '10자 이상 입력하세요' : '';
    $('authSubmit').textContent = register ? '가입하기' : '로그인';
    $('authStatus').textContent = '';
    $('authSwitch').hidden = mode === 'admin';
    $('authSwitch').textContent = register ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원 가입';
    if (!$('authDialog').open) $('authDialog').showModal();
    $('usernameInput').focus();
  }

  function modeChanged() {
    const mode = $('noticeModeInput').value;
    const clear = mode === 'normal';
    $('noticeTextFields').hidden = clear;
    $('noticeTitleInput').required = !clear;
    $('noticeBodyInput').required = !clear;
    $('noticeModeHint').textContent = mode === 'maintenance'
      ? '점검 화면을 표시하고 일반 게시판 이용을 중단합니다. 화면 반영을 확인한 뒤 작업을 시작하세요.'
      : clear ? '공지와 점검 화면을 종료합니다. 서비스 복구를 확인한 뒤 반영하세요.'
      : '게시글 목록 맨 위에 빨간색 공지 표시와 함께 고정합니다. 제목을 누르면 본문을 볼 수 있습니다.';
    $('noticeSubmit').textContent = clear ? '공지 종료 / 점검 해제' : '공지 반영';
  }

  async function loadHistory() {
    const rows = await api('/api/admin/notices');
    $('noticeHistory').replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = row.title || labels[row.mode];
      const meta = document.createElement('span');
      meta.textContent = `${labels[row.mode]} · ${row.authorName} · ${new Date(row.createdAt).toLocaleString('ko-KR')}`;
      const body = document.createElement('p');
      body.textContent = row.message;
      item.append(title, meta, body);
      $('noticeHistory').append(item);
    }
    if (!rows.length) {
      const item = document.createElement('li');
      item.textContent = '아직 작성한 공지가 없습니다.';
      $('noticeHistory').append(item);
    }
  }

  async function openAdmin() {
    $('adminStatus').textContent = '';
    if (!$('adminDialog').open) $('adminDialog').showModal();
    try {
      await loadHistory();
      const response = await fetch('/notice.json', { cache: 'no-store' });
      const notice = await response.json();
      $('noticeModeInput').value = notice.mode === 'normal' ? 'announce' : notice.mode;
      if (notice.mode !== 'normal') {
        $('noticeTitleInput').value = notice.title || '';
        $('noticeBodyInput').value = notice.message || '';
      }
      modeChanged();
    } catch (error) { $('adminStatus').textContent = error.message; }
  }

  $('memberLoginButton').addEventListener('click', () => openAuth('login'));
  $('adminLoginButton').addEventListener('click', () => currentUser?.role === 'admin' ? openAdmin() : openAuth('admin'));
  $('authSwitch').addEventListener('click', () => openAuth(authMode === 'register' ? 'login' : 'register'));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  $('authDialog').addEventListener('close', () => { $('passwordInput').value = ''; });

  $('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('authSubmit').disabled = true;
    $('authStatus').dataset.tone = 'pending';
    $('authStatus').textContent = '확인 중…';
    try {
      const data = await api(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
        username: $('usernameInput').value, password: $('passwordInput').value,
        displayName: $('displayNameInput').value, admin: authMode === 'admin'
      });
      setSession(data);
      $('authDialog').close();
      if (currentUser.role === 'admin') await openAdmin();
    } catch (error) { $('authStatus').dataset.tone = 'error'; $('authStatus').textContent = error.message; }
    finally { $('authSubmit').disabled = false; }
  });

  $('logoutButton').addEventListener('click', async () => {
    $('logoutButton').disabled = true;
    try { await api('/api/auth/logout', {}); setSession({}); $('adminDialog').close(); }
    catch (error) { window.alert(error.message); }
    finally { $('logoutButton').disabled = false; }
  });

  $('noticeModeInput').addEventListener('change', modeChanged);
  $('noticeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = $('noticeModeInput').value;
    if (mode === 'maintenance' && !window.confirm('점검 화면을 표시하고 게시판 이용을 중단할까요?')) return;
    if (mode === 'normal' && !window.confirm('서비스가 복구되었나요? 공지와 점검 화면을 종료합니다.')) return;
    $('noticeSubmit').disabled = true;
    $('adminStatus').dataset.tone = 'pending';
    $('adminStatus').textContent = '공지를 저장하고 화면 반영을 확인하고 있습니다…';
    try {
      // An announcement must not accidentally reopen an ongoing maintenance window.
      if (mode === 'announce') {
        const active = await fetch('/notice.json', { cache: 'no-store' }).then((r) => r.json());
        if (active.mode === 'maintenance') throw new Error('먼저 서비스 복구를 확인하고 점검을 해제해 주세요.');
      }
      const notice = await api('/api/admin/notices', { mode, title: $('noticeTitleInput').value, message: $('noticeBodyInput').value });
      let published = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const response = await fetch('/notice.json', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
          const snapshot = await response.json();
          if (snapshot.id === notice.id) { published = true; break; }
        } catch { /* Retry until the Web snapshot is available. */ }
      }
      $('adminStatus').dataset.tone = published ? 'success' : 'error';
      $('adminStatus').textContent = published ? '공지 반영이 완료되었습니다.' : '저장했지만 화면 반영을 확인하지 못했습니다. 화면을 확인하고, 점검 작업은 반영 후 시작해 주세요.';
      window.dispatchEvent(new Event('board-notice-updated'));
      await loadHistory();
    } catch (error) { $('adminStatus').dataset.tone = 'error'; $('adminStatus').textContent = error.message; }
    finally { $('noticeSubmit').disabled = false; }
  });

  modeChanged();
  api('/api/auth/session').then(setSession).catch(() => setSession({}));
})();
