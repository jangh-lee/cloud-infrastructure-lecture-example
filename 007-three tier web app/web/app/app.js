const config = window.CHAPTER3_CONFIG || {};
const backendBaseUrl = (config.BACKEND_BASE_URL || "").replace(/\/$/, "");
const siteTitle = config.SITE_TITLE || "DevForum";
const pageSize = 15;

const elements = {
  siteTitle: document.getElementById("siteTitle"),
  healthStatus: document.getElementById("healthStatus"),
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
  isLoading: false
};

let toastTimer;

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

function renderDetail(postId) {
  const post = state.posts.find((item) => String(item.id) === String(postId));
  setVisibleView("detail");

  if (!post) {
    elements.detailTitle.textContent = state.isLoading ? "게시글을 불러오는 중입니다" : "게시글을 찾을 수 없습니다";
    elements.detailAuthor.textContent = "";
    elements.detailDate.textContent = "";
    elements.detailContent.textContent = state.isLoading ? "" : "삭제되었거나 존재하지 않는 게시글입니다.";
    elements.deleteButton.hidden = true;
    document.title = `게시글 · ${siteTitle}`;
    return;
  }

  state.selectedPostId = String(post.id);
  elements.detailTitle.textContent = post.title;
  elements.detailAuthor.textContent = post.authorName || "비가입 유저";
  elements.detailDate.textContent = formatDate(post.createdAt, true);
  elements.detailContent.textContent = post.content;
  elements.deleteButton.hidden = false;
  document.title = `${post.title} · ${siteTitle}`;
}

function renderRoute() {
  const route = getRoute();
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

async function checkHealth() {
  if (!backendBaseUrl) {
    setHealthStatus("status-fail", "서버 주소 미설정");
    return;
  }

  try {
    const response = await fetch(`${backendBaseUrl}/api/health`);
    if (!response.ok) {
      throw new Error("Health check failed");
    }
    setHealthStatus("status-ok", "서버 연결됨");
  } catch (error) {
    setHealthStatus("status-fail", "서버 연결 안 됨");
  }
}

async function loadPosts({ announce = false } = {}) {
  if (!backendBaseUrl) {
    elements.listStatus.textContent = "백엔드 서버 주소가 설정되지 않았습니다.";
    renderRoute();
    return;
  }

  state.isLoading = true;
  elements.listStatus.textContent = "";
  renderRoute();

  try {
    const response = await fetch(`${backendBaseUrl}/api/posts`);
    if (!response.ok) {
      throw new Error("Failed to load posts");
    }
    state.posts = await response.json();
    if (announce) {
      showToast("게시글을 새로 불러왔습니다.");
    }
  } catch (error) {
    elements.listStatus.textContent = "게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    state.isLoading = false;
    renderRoute();
  }
}

async function createPost(event) {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  const content = elements.contentInput.value.trim();

  if (!title || !content) {
    elements.formStatus.textContent = "제목과 내용을 모두 입력해 주세요.";
    return;
  }
  if (!backendBaseUrl) {
    elements.formStatus.textContent = "백엔드 서버 주소가 설정되지 않았습니다.";
    return;
  }

  elements.formStatus.textContent = "";
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "등록 중";

  try {
    const response = await fetch(`${backendBaseUrl}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, authorName: "비가입 유저" })
    });
    if (!response.ok) {
      throw new Error("Failed to create post");
    }

    const createdPost = await response.json();
    state.posts.unshift(createdPost);
    elements.postForm.reset();
    updateCharacterCounts();
    showToast("게시글이 등록되었습니다.");
    navigate(`/posts/${createdPost.id}`);
  } catch (error) {
    elements.formStatus.textContent = "게시글을 등록하지 못했습니다. 다시 시도해 주세요.";
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "등록";
  }
}

async function deleteSelectedPost() {
  if (!state.selectedPostId || !window.confirm("이 게시글을 삭제할까요?")) {
    return;
  }

  elements.deleteButton.disabled = true;
  try {
    const response = await fetch(`${backendBaseUrl}/api/posts/${state.selectedPostId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error("Failed to delete post");
    }
    state.posts = state.posts.filter((post) => String(post.id) !== state.selectedPostId);
    showToast("게시글이 삭제되었습니다.");
    navigate("/");
  } catch (error) {
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
elements.postForm.addEventListener("submit", createPost);
elements.deleteButton.addEventListener("click", deleteSelectedPost);
elements.titleInput.addEventListener("input", updateCharacterCounts);
elements.contentInput.addEventListener("input", updateCharacterCounts);
window.addEventListener("popstate", renderRoute);

updateCharacterCounts();
checkHealth();
loadPosts();
