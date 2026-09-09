const config = window.BOARD_SERVICE_CONFIG || {};
const siteTitle = config.SITE_TITLE || "DevForum";
const pageSize = 15;

const elements = {
  noticeRow: document.getElementById("noticeRow"),
  noticeTitle: document.getElementById("noticeTitle"),
  noticeMeta: document.getElementById("noticeMeta"),
  noticeDate: document.getElementById("noticeDate"),
  serviceView: document.getElementById("serviceView"),
  serviceLabel: document.getElementById("serviceLabel"),
  serviceTitle: document.getElementById("serviceTitle"),
  serviceMessage: document.getElementById("serviceMessage"),
  serviceRetry: document.getElementById("serviceRetry"),
  siteTitle: document.getElementById("siteTitle"),
  healthStatus: document.getElementById("healthStatus"),
  webInstanceInfo: document.getElementById("webInstanceInfo"),
  listView: document.getElementById("listView"),
  detailView: document.getElementById("detailView"),
  writeView: document.getElementById("writeView"),
  postCount: document.getElementById("postCount"),
  postList: document.getElementById("postList"),
  emptyState: document.getElementById("emptyState"),
  listStatus: document.getElementById("listStatus"),
  pagination: document.getElementById("pagination"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  refreshButton: document.getElementById("refreshButton"),
  detailTitle: document.getElementById("detailTitle"),
  detailNoticeLabel: document.getElementById("detailNoticeLabel"),
  detailAuthor: document.getElementById("detailAuthor"),
  detailDate: document.getElementById("detailDate"),
  detailContent: document.getElementById("detailContent"),
  deleteButton: document.getElementById("deleteButton"),
  postForm: document.getElementById("postForm"),
  titleInput: document.getElementById("titleInput"),
  contentInput: document.getElementById("contentInput"),
  titleCount: document.getElementById("titleCount"),
  contentCount: document.getElementById("contentCount"),
  formStatus: document.getElementById("formStatus"),
  submitButton: document.getElementById("submitButton"),
  toast: document.getElementById("toast")
};

const state = {
  posts: [],
  searchQuery: "",
  currentPage: 1,
  selectedPostId: null,
  isLoading: false,
  notice: { mode: "normal", title: "", message: "" },
  unavailable: false,
  postsLoaded: false
};

let toastTimer;
let serviceCheck;
window.addEventListener("board-notice-updated", () => refreshService());

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function serviceBlocked() {
  return state.notice.mode === "maintenance" || state.unavailable;
}

function renderNotice() {
  elements.noticeRow.hidden = state.notice.mode !== "announce";
  elements.noticeTitle.textContent = state.notice.title;
  const date = state.notice.updatedAt ? formatDate(state.notice.updatedAt, true) : "";
  elements.noticeMeta.textContent = date ? `관리자 · ${date}` : "관리자";
  elements.noticeDate.textContent = date;
  elements.serviceView.hidden = !serviceBlocked();
  if (!serviceBlocked()) return;
  const planned = state.notice.mode === "maintenance";
  elements.serviceLabel.textContent = planned ? "점검 안내" : "서비스 연결 안내";
  elements.serviceTitle.textContent = planned ? state.notice.title : "서비스에 일시적인 문제가 발생했습니다";
  elements.serviceMessage.textContent = planned ? state.notice.message : "현재 게시판에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.\n작성 중인 내용은 이 창을 유지하면 보존됩니다.";
  setHealthStatus("status-fail", planned ? "서비스 점검 중" : "서버 연결 안 됨");
}

async function readNotice() {
  try {
    const response = await request("/notice.json");
    if (!response.ok) return;
    const notice = await response.json();
    if (["normal", "announce", "maintenance"].includes(notice.mode)) {
      state.notice = { mode: notice.mode, title: String(notice.title || "서비스 점검 안내"), message: String(notice.message || ""), updatedAt: notice.updatedAt || "" };
    }
  } catch {
    // Preserve the last known notice when a status request fails.
  }
}

async function refreshService() {
  if (serviceCheck) return serviceCheck;
  serviceCheck = (async () => {
    const wasBlocked = serviceBlocked();
    await readNotice();
    if (state.notice.mode !== "maintenance") {
      try {
        const response = await request("/api/health");
        state.unavailable = !response.ok;
        if (response.ok) setHealthStatus("status-ok", "서버 연결됨");
      } catch {
        state.unavailable = true;
      }
    }
    renderNotice();
    if (serviceBlocked()) {
      state.postsLoaded = false;
      renderRoute();
    } else if (wasBlocked || !state.postsLoaded) {
      await loadPosts();
    } else if (getRoute().name === "notice") {
      renderRoute();
    }
  })();
  try {
    await serviceCheck;
  } finally {
    serviceCheck = null;
  }
}

function apiError(response) {
  const error = new Error("API request failed");
  error.unavailable = [502, 503, 504].includes(response.status);
  return error;
}

function showConnectionFailure(error) {
  if (error.unavailable || error.name === "AbortError" || error instanceof TypeError) {
    state.unavailable = true;
    state.postsLoaded = false;
    renderNotice();
    renderRoute();
  }
}

elements.siteTitle.textContent = siteTitle;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {})
  }).format(date);
}

function setHealthStatus(kind, text) {
  elements.healthStatus.className = `connection-status ${kind}`;
  elements.healthStatus.textContent = text;
}

function setVisibleView(viewName) {
  elements.listView.hidden = viewName !== "list";
  elements.detailView.hidden = viewName !== "detail";
  elements.writeView.hidden = viewName !== "write";
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2200);
}

function navigate(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  renderRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getRoute() {
  if (window.location.pathname === "/notice" || window.location.pathname === "/notice/") {
    return { name: "notice" };
  }
  const detailMatch = window.location.pathname.match(/^\/posts\/(\d+)\/?$/);
  if (detailMatch) {
    return { name: "detail", postId: detailMatch[1] };
  }
  if (window.location.pathname === "/write" || window.location.pathname === "/write/") {
    return { name: "write" };
  }
  return { name: "list" };
}

function filteredPosts() {
  const query = state.searchQuery.trim().toLocaleLowerCase("ko-KR");
  if (!query) {
    return state.posts;
  }

  return state.posts.filter((post) =>
    String(post.title).toLocaleLowerCase("ko-KR").includes(query)
    || String(post.authorName).toLocaleLowerCase("ko-KR").includes(query)
  );
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    elements.pagination.innerHTML = "";
    return;
  }

  const start = Math.max(1, state.currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const pageButtons = [];
  for (let page = Math.max(1, end - 4); page <= end; page += 1) {
    pageButtons.push(`
      <button class="page-button${page === state.currentPage ? " is-active" : ""}"
              type="button" data-page="${page}" ${page === state.currentPage ? 'aria-current="page"' : ""}>
        ${page}
      </button>
    `);
  }

  elements.pagination.innerHTML = `
    <button class="page-button page-move" type="button" data-page="${state.currentPage - 1}"
            ${state.currentPage === 1 ? "disabled" : ""}>이전</button>
    ${pageButtons.join("")}
    <button class="page-button page-move" type="button" data-page="${state.currentPage + 1}"
            ${state.currentPage === totalPages ? "disabled" : ""}>다음</button>
  `;
}

function renderPostList() {
  const posts = filteredPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const startIndex = (state.currentPage - 1) * pageSize;
  const pagePosts = posts.slice(startIndex, startIndex + pageSize);

  elements.postCount.textContent = String(posts.length);
  elements.emptyState.hidden = state.isLoading || pagePosts.length > 0;
  elements.postList.innerHTML = state.isLoading
    ? Array.from({ length: 8 }, () => '<div class="loading-row" aria-hidden="true"></div>').join("")
    : pagePosts.map((post, index) => {
      const rowNumber = posts.length - startIndex - index;
      const author = escapeHtml(post.authorName || "비가입 유저");
      const date = formatDate(post.createdAt, true);
      return `
        <button class="board-row post-row" type="button" data-post-id="${post.id}">
          <span class="post-number">${rowNumber}</span>
          <span class="post-title">
            <strong>${escapeHtml(post.title)}</strong>
            <small>${author} · ${date}</small>
          </span>
          <span class="post-author">${author}</span>
          <time class="post-date">${date}</time>
        </button>
      `;
    }).join("");

  renderPagination(state.isLoading ? 1 : totalPages);
}

function renderDetail(postId, isNotice = false) {
  const post = isNotice
    ? state.notice.mode === "announce" && { title: state.notice.title, content: state.notice.message, authorName: "관리자", createdAt: state.notice.updatedAt }
    : state.posts.find((item) => String(item.id) === String(postId));
  setVisibleView("detail");
  state.selectedPostId = null;
  elements.detailNoticeLabel.hidden = !isNotice || !post;

  if (!post) {
    elements.detailTitle.textContent = isNotice ? "공지가 종료되었습니다" : state.isLoading ? "게시글을 불러오는 중입니다" : "게시글을 찾을 수 없습니다";
    elements.detailAuthor.textContent = "";
    elements.detailDate.textContent = "";
    elements.detailContent.textContent = isNotice ? "현재 게시 중인 공지가 없습니다. 목록에서 다른 게시글을 확인해 주세요." : state.isLoading ? "" : "삭제되었거나 존재하지 않는 게시글입니다.";
    elements.deleteButton.hidden = true;
    document.title = `게시글 · ${siteTitle}`;
    return;
  }

  state.selectedPostId = isNotice ? null : String(post.id);
  elements.detailTitle.textContent = post.title;
  elements.detailAuthor.textContent = post.authorName || "비가입 유저";
  elements.detailDate.textContent = post.createdAt ? formatDate(post.createdAt, true) : "";
  elements.detailContent.textContent = post.content;
  elements.deleteButton.hidden = isNotice;
  document.title = `${post.title} · ${siteTitle}`;
}

function renderRoute() {
  if (serviceBlocked()) {
    setVisibleView(null);
    renderNotice();
    document.title = `${state.notice.mode === "maintenance" ? "점검 안내" : "서비스 연결 안내"} · ${siteTitle}`;
    return;
  }
  const route = getRoute();
  if (route.name === "notice") {
    renderDetail(null, true);
    return;
  }
  if (route.name === "detail") {
    renderDetail(route.postId);
    return;
  }
  if (route.name === "write") {
    setVisibleView("write");
    elements.formStatus.textContent = "";
    document.title = `글쓰기 · ${siteTitle}`;
    requestAnimationFrame(() => elements.titleInput.focus());
    return;
  }

  setVisibleView("list");
  state.selectedPostId = null;
  renderPostList();
  document.title = `게시글 · ${siteTitle}`;
}

async function checkWebInstance() {
  try {
    const response = await fetch("/web-instance", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Web instance check failed");
    }

    const web = await response.json();
    const instance = web.instance || "unknown";
    const privateIp = web.privateIp || "unknown";
    elements.webInstanceInfo.textContent = `Web ${instance} · ${privateIp}`;
  } catch (error) {
    elements.webInstanceInfo.textContent = "Web 정보 확인 안 됨";
  }
}

async function loadPosts({ announce = false } = {}) {
  if (serviceBlocked()) return;
  state.isLoading = true;
  elements.listStatus.textContent = "";
  renderRoute();

  try {
    const response = await request("/api/posts");
    if (!response.ok) {
      throw apiError(response);
    }
    state.posts = await response.json();
    state.postsLoaded = true;
    if (announce) {
      showToast("게시글을 새로 불러왔습니다.");
    }
  } catch (error) {
    showConnectionFailure(error);
    elements.listStatus.textContent = "게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    state.isLoading = false;
    renderRoute();
  }
}

async function createPost(event) {
  event.preventDefault();
  if (serviceBlocked()) return;
  const title = elements.titleInput.value.trim();
  const content = elements.contentInput.value.trim();

  if (!title || !content) {
    elements.formStatus.textContent = "제목과 내용을 모두 입력해 주세요.";
    return;
  }
  elements.formStatus.textContent = "";
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "등록 중";

  try {
    const response = await request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, authorName: "비가입 유저" })
    });
    if (!response.ok) {
      throw apiError(response);
    }

    const createdPost = await response.json();
    state.posts.unshift(createdPost);
    elements.postForm.reset();
    updateCharacterCounts();
    showToast("게시글이 등록되었습니다.");
    navigate(`/posts/${createdPost.id}`);
  } catch (error) {
    showConnectionFailure(error);
    elements.formStatus.textContent = "게시글을 등록하지 못했습니다. 다시 시도해 주세요.";
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "등록";
  }
}

async function deleteSelectedPost() {
  if (serviceBlocked()) return;
  if (!state.selectedPostId || !window.confirm("이 게시글을 삭제할까요?")) {
    return;
  }

  elements.deleteButton.disabled = true;
  try {
    const response = await request(`/api/posts/${state.selectedPostId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw apiError(response);
    }
    state.posts = state.posts.filter((post) => String(post.id) !== state.selectedPostId);
    showToast("게시글이 삭제되었습니다.");
    navigate("/");
  } catch (error) {
    showConnectionFailure(error);
    showToast("게시글을 삭제하지 못했습니다.");
  } finally {
    elements.deleteButton.disabled = false;
  }
}

function updateCharacterCounts() {
  elements.titleCount.textContent = `${elements.titleInput.value.length} / 120`;
  elements.contentCount.textContent = `${elements.contentInput.value.length} / 2000`;
}

document.addEventListener("click", (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    navigate(routeTarget.dataset.route);
    return;
  }

  const postTarget = event.target.closest("[data-post-id]");
  if (postTarget) {
    navigate(`/posts/${postTarget.dataset.postId}`);
    return;
  }

  const pageTarget = event.target.closest("[data-page]");
  if (pageTarget && !pageTarget.disabled) {
    state.currentPage = Number(pageTarget.dataset.page);
    renderPostList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.searchQuery = elements.searchInput.value;
  state.currentPage = 1;
  renderPostList();
});
elements.searchInput.addEventListener("search", () => {
  state.searchQuery = elements.searchInput.value;
  state.currentPage = 1;
  renderPostList();
});
elements.refreshButton.addEventListener("click", () => loadPosts({ announce: true }));
elements.serviceRetry.addEventListener("click", refreshService);
elements.postForm.addEventListener("submit", createPost);
elements.deleteButton.addEventListener("click", deleteSelectedPost);
elements.titleInput.addEventListener("input", updateCharacterCounts);
elements.contentInput.addEventListener("input", updateCharacterCounts);
window.addEventListener("popstate", renderRoute);

updateCharacterCounts();
checkWebInstance();
setInterval(checkWebInstance, 5000);
setVisibleView(null);
refreshService();
setInterval(refreshService, 5000);
