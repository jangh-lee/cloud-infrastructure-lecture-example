const config = window.CHAPTER3_CONFIG || {};
const backendBaseUrl = (config.BACKEND_BASE_URL || "").replace(/\/$/, "");
const siteTitle = config.SITE_TITLE || "DevForum Practice Board";

const siteTitleElement = document.getElementById("siteTitle");
const apiBaseUrlElement = document.getElementById("apiBaseUrl");
const healthStatusElement = document.getElementById("healthStatus");
const postForm = document.getElementById("postForm");
const titleInput = document.getElementById("titleInput");
const contentInput = document.getElementById("contentInput");
const postList = document.getElementById("postList");
const emptyState = document.getElementById("emptyState");
const refreshButton = document.getElementById("refreshButton");

siteTitleElement.textContent = siteTitle;
apiBaseUrlElement.textContent = backendBaseUrl || "BACKEND_BASE_URL is not configured";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR");
}

function setHealthStatus(kind, text) {
  healthStatusElement.className = `status-chip ${kind}`;
  healthStatusElement.textContent = text;
}

async function checkHealth() {
  if (!backendBaseUrl) {
    setHealthStatus("status-fail", "Backend URL Missing");
    return;
  }

  try {
    const response = await fetch(`${backendBaseUrl}/api/health`);
    if (!response.ok) {
      throw new Error("Health check failed");
    }

    setHealthStatus("status-ok", "Backend Connected");
  } catch (error) {
    setHealthStatus("status-fail", "Backend Unreachable");
  }
}

function renderPosts(posts) {
  postList.innerHTML = posts
    .map((post) => `
      <article class="post-item">
        <div class="post-head">
          <div>
            <h3>${escapeHtml(post.title)}</h3>
            <div class="post-meta">
              <span>작성자 ${escapeHtml(post.authorName)}</span>
              <span>${formatDate(post.createdAt)}</span>
            </div>
          </div>
          <button class="delete-button" data-delete-id="${post.id}" type="button">삭제</button>
        </div>
        <p class="post-body">${escapeHtml(post.content)}</p>
      </article>
    `)
    .join("");

  emptyState.hidden = posts.length > 0;
}

async function loadPosts() {
  if (!backendBaseUrl) {
    renderPosts([]);
    return;
  }

  try {
    const response = await fetch(`${backendBaseUrl}/api/posts`);
    if (!response.ok) {
      throw new Error("Failed to load posts");
    }

    const posts = await response.json();
    renderPosts(posts);
  } catch (error) {
    postList.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = "백엔드 서버에 연결할 수 없습니다.";
  }
}

async function createPost(event) {
  event.preventDefault();

  const payload = {
    title: titleInput.value.trim(),
    content: contentInput.value.trim(),
    authorName: "비가입 유저"
  };

  const response = await fetch(`${backendBaseUrl}/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    alert("게시글 저장에 실패했습니다.");
    return;
  }

  postForm.reset();
  await loadPosts();
}

async function deletePost(id) {
  const response = await fetch(`${backendBaseUrl}/api/posts/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    alert("게시글 삭제에 실패했습니다.");
    return;
  }

  await loadPosts();
}

postForm.addEventListener("submit", createPost);
refreshButton.addEventListener("click", loadPosts);

postList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) {
    return;
  }

  await deletePost(deleteButton.dataset.deleteId);
});

checkHealth();
loadPosts();
