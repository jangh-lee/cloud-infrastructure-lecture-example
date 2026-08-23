const views = document.querySelectorAll(".view");
const navLinks = document.querySelectorAll(".nav-link");
const healthBadge = document.getElementById("healthBadge");

const fortuneForm = document.getElementById("fortuneForm");
const fortuneSubmitButton = fortuneForm.querySelector('button[type="submit"]');
const fortuneLoading = document.getElementById("fortuneLoading");
const fortuneEmpty = document.getElementById("fortuneEmpty");
const fortuneResult = document.getElementById("fortuneResult");

const ragForm = document.getElementById("ragForm");
const ragPrompt = document.getElementById("ragPrompt");
const ragSubmitButton = document.getElementById("ragSubmitButton");
const ragConversation = document.getElementById("ragConversation");
const ragWelcome = document.getElementById("ragWelcome");
const newChatButton = document.getElementById("newChatButton");

const documentAdminLoadForm = document.getElementById("documentAdminLoadForm");
const documentAdminPassword = document.getElementById("documentAdminPassword");
const documentDashboard = document.getElementById("documentDashboard");
const documentList = document.getElementById("documentList");
const knowledgeMap = document.getElementById("knowledgeMap");
const keywordCloud = document.getElementById("keywordCloud");
const documentForm = document.getElementById("documentForm");
const documentId = document.getElementById("documentId");
const documentTitle = document.getElementById("documentTitle");
const documentSource = document.getElementById("documentSource");
const documentContent = document.getElementById("documentContent");
const documentContentLength = document.getElementById("documentContentLength");
const documentEditorTitle = document.getElementById("documentEditorTitle");
const documentSaveStatus = document.getElementById("documentSaveStatus");
const newDocumentButton = document.getElementById("newDocumentButton");
const deleteDocumentButton = document.getElementById("deleteDocumentButton");
const saveDocumentButton = document.getElementById("saveDocumentButton");

const adminLoadForm = document.getElementById("adminLoadForm");
const adminSaveForm = document.getElementById("adminSaveForm");
const adminPassword = document.getElementById("adminPassword");
let ragMessages = [];
let ragDocuments = [];
let selectedDocumentId = null;

function activateView(target) {
  navLinks.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === target);
  });

  views.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === target);
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }
  return data;
}

function renderFortune(data) {
  fortuneEmpty.hidden = true;
  fortuneResult.hidden = false;
  fortuneResult.innerHTML = `
    <div class="fortune-title">
      <h3>${data.title}</h3>
      <span class="score-badge">${data.score}점</span>
    </div>
    <div class="fortune-box"><strong>오늘의 요약</strong><div>${data.summary}</div></div>
    <div class="fortune-grid">
      <div class="fortune-box"><strong>기운의 흐름</strong><div>${data.energyFlow}</div></div>
      <div class="fortune-box"><strong>강점</strong><div>${data.strength}</div></div>
      <div class="fortune-box"><strong>주의점</strong><div>${data.caution}</div></div>
      <div class="fortune-box"><strong>행운 포인트</strong><div>색상: ${data.luckyColor}<br>방향: ${data.luckyDirection}<br>시간: ${data.luckyTime}</div></div>
    </div>
    <div class="fortune-box"><strong>키워드</strong><div>${(data.keywords || []).join(", ")}</div></div>
  `;

}

navLinks.forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.view));
});

fortuneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  fortuneLoading.hidden = false;
  fortuneEmpty.hidden = true;
  fortuneResult.hidden = true;
  fortuneSubmitButton.disabled = true;
  fortuneSubmitButton.textContent = "운세 확인 중...";

  try {
    const [data] = await Promise.all([
      requestJson("/api/fortune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthYear: document.getElementById("birthYear").value,
          birthMonth: document.getElementById("birthMonth").value,
          birthDay: document.getElementById("birthDay").value,
          birthHour: document.getElementById("birthHour").value,
          calendarType: document.getElementById("calendarType").value
        })
      }),
      new Promise((resolve) => setTimeout(resolve, 650))
    ]);
    renderFortune(data);
  } catch (error) {
    alert(error.message);
    fortuneEmpty.hidden = false;
  } finally {
    fortuneLoading.hidden = true;
    fortuneSubmitButton.disabled = false;
    fortuneSubmitButton.textContent = "오늘의 운세 보기";
  }
});

function createRagMessage(role, content, metadata = null) {
  const message = document.createElement("article");
  message.className = `rag-message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "rag-avatar";
  avatar.textContent = role === "user" ? "나" : "AI";

  const body = document.createElement("div");
  body.className = "rag-message-body";
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "You" : "RAG Assistant";
  const text = document.createElement("div");
  text.className = "rag-answer-text";
  const answerParts = String(content).split(/(\[\d+\])/g);
  answerParts.forEach((part) => {
    if (role === "assistant" && /^\[\d+\]$/.test(part)) {
      const citation = document.createElement("span");
      citation.className = "citation-marker";
      citation.textContent = part;
      text.append(citation);
    } else {
      text.append(document.createTextNode(part));
    }
  });
  body.append(label, text);

  if (metadata?.sources?.length) {
    const sources = document.createElement("div");
    sources.className = "rag-sources";
    const sourceLabel = document.createElement("strong");
    sourceLabel.className = "rag-sources-title";
    sourceLabel.textContent = "참고한 문서";
    sources.append(sourceLabel);
    metadata.sources.forEach((source, index) => {
      const evidence = document.createElement("article");
      evidence.className = "source-evidence";
      const heading = document.createElement("div");
      heading.className = "source-evidence-heading";
      const number = document.createElement("span");
      number.textContent = `[${index + 1}]`;
      const title = document.createElement("strong");
      title.textContent = source.title;
      const path = document.createElement("small");
      path.textContent = source.source;
      heading.append(number, title, path);
      evidence.append(heading);

      if (source.excerpt) {
        const excerpt = document.createElement("blockquote");
        appendHighlightedExcerpt(excerpt, source.excerpt, source.query || "");
        evidence.append(excerpt);
      }
      sources.append(evidence);
    });
    body.append(sources);
  }

  if (metadata?.searchQueries?.length || metadata?.usage?.totalTokens) {
    const details = document.createElement("div");
    details.className = "rag-response-meta";
    if (metadata.searchQueries?.length) {
      details.textContent = `검색어: ${metadata.searchQueries.join(", ")}`;
    }
    if (metadata.usage?.totalTokens) {
      details.textContent += `${details.textContent ? " · " : ""}토큰: ${metadata.usage.totalTokens}`;
    }
    body.append(details);
  }

  message.append(avatar, body);
  ragConversation.append(message);
  ragConversation.scrollTop = ragConversation.scrollHeight;
  return message;
}

function appendHighlightedExcerpt(container, excerpt, query) {
  const ignored = new Set(["어떻게", "알려줘", "무엇", "대한", "관련", "방법", "하는", "에서", "으로"]);
  const tokens = [...new Set((query.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [])
    .filter((token) => !ignored.has(token)))]
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) {
    container.textContent = excerpt;
    return;
  }

  const escapedTokens = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escapedTokens.join("|")})`, "gi");
  String(excerpt).split(pattern).forEach((part) => {
    if (tokens.includes(part.toLowerCase())) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      container.append(mark);
    } else {
      container.append(document.createTextNode(part));
    }
  });
}

function createRagLoading() {
  const message = createRagMessage("assistant", "");
  message.classList.add("is-loading");
  const text = message.querySelector(".rag-answer-text");
  text.innerHTML = '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span><em>문서를 검색하고 답변을 정리하는 중...</em>';
  return message;
}

async function submitRagQuestion(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || ragSubmitButton.disabled) {
    return;
  }

  ragWelcome.hidden = true;
  ragMessages.push({ role: "user", content: cleanQuestion });
  createRagMessage("user", cleanQuestion);
  ragPrompt.value = "";
  ragPrompt.style.height = "auto";
  ragSubmitButton.disabled = true;
  ragSubmitButton.textContent = "검색 중";
  const loadingMessage = createRagLoading();

  try {
    const data = await requestJson("/api/rag/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: ragMessages })
    });
    loadingMessage.remove();
    ragMessages.push({ role: "assistant", content: data.answer });
    createRagMessage("assistant", data.answer, data);
  } catch (error) {
    loadingMessage.remove();
    createRagMessage("assistant", `답변을 가져오지 못했습니다. ${error.message}`);
  } finally {
    ragSubmitButton.disabled = false;
    ragSubmitButton.textContent = "전송";
    ragPrompt.focus();
  }
}

ragForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitRagQuestion(ragPrompt.value);
});

ragPrompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    ragForm.requestSubmit();
  }
});

ragPrompt.addEventListener("input", () => {
  ragPrompt.style.height = "auto";
  ragPrompt.style.height = `${Math.min(ragPrompt.scrollHeight, 180)}px`;
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => submitRagQuestion(button.dataset.question));
});

newChatButton.addEventListener("click", () => {
  ragMessages = [];
  ragConversation.querySelectorAll(".rag-message").forEach((message) => message.remove());
  ragWelcome.hidden = false;
  ragPrompt.value = "";
  ragPrompt.focus();
});

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function setDocumentEditor(document = null) {
  selectedDocumentId = document?.id || null;
  documentForm.reset();
  documentId.value = document?.id || "";
  documentId.disabled = Boolean(document);
  documentTitle.value = document?.title || "";
  documentSource.value = document?.source || "";
  documentContent.value = document?.content || "";
  documentContentLength.textContent = formatNumber(documentContent.value.length);
  documentEditorTitle.textContent = document ? "문서 수정" : "새 문서 추가";
  documentSaveStatus.textContent = document ? "저장됨" : "작성 중";
  documentSaveStatus.className = `save-status ${document ? "saved" : ""}`;
  deleteDocumentButton.hidden = !document;
  renderDocumentList();
  renderKnowledgeMap();
}

function renderDocumentList() {
  documentList.replaceChildren();
  ragDocuments.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `document-list-item ${item.id === selectedDocumentId ? "is-active" : ""}`;

    const number = document.createElement("span");
    number.className = "document-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "document-list-copy";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const source = document.createElement("small");
    source.textContent = item.source;
    const size = document.createElement("span");
    size.className = "document-size";
    size.textContent = `${formatNumber(item.content.length)}자`;
    copy.append(title, source);
    button.append(number, copy, size);
    button.addEventListener("click", () => setDocumentEditor(item));
    documentList.append(button);
  });
}

function renderKnowledgeMap() {
  knowledgeMap.replaceChildren();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  knowledgeMap.append(svg);

  const center = document.createElement("div");
  center.className = "knowledge-center";
  center.innerHTML = "<strong>RAG</strong><span>Knowledge</span>";
  knowledgeMap.append(center);

  ragDocuments.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(ragDocuments.length, 1) - Math.PI / 2;
    const radiusX = ragDocuments.length > 7 ? 40 : 36;
    const radiusY = ragDocuments.length > 7 ? 39 : 34;
    const x = 50 + Math.cos(angle) * radiusX;
    const y = 50 + Math.sin(angle) * radiusY;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "50");
    line.setAttribute("y1", "50");
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    if (item.id === selectedDocumentId) {
      line.classList.add("is-active");
    }
    svg.append(line);

    const node = document.createElement("button");
    node.type = "button";
    node.className = `knowledge-node color-${index % 5} ${item.id === selectedDocumentId ? "is-active" : ""}`;
    node.style.setProperty("--node-x", `${x}%`);
    node.style.setProperty("--node-y", `${y}%`);
    node.title = item.title;
    const shortTitle = item.title.replace(/^Chapter \d+ - /, "");
    node.textContent = shortTitle.length > 12 ? `${shortTitle.slice(0, 12)}...` : shortTitle;
    node.addEventListener("click", () => setDocumentEditor(item));
    knowledgeMap.append(node);
  });
}

function renderKeywordCloud(keywords) {
  keywordCloud.replaceChildren();
  const maxCount = Math.max(...keywords.map((item) => item.count), 1);
  keywords.forEach((item, index) => {
    const keyword = document.createElement("span");
    keyword.className = `keyword-tag tone-${index % 4}`;
    keyword.style.setProperty("--keyword-scale", String(.8 + item.count / maxCount * .55));
    keyword.textContent = item.keyword;
    keyword.title = `${item.count}개 문서에서 발견`;
    keywordCloud.append(keyword);
  });
}

function renderDocumentDashboard(data) {
  ragDocuments = data.documents;
  document.getElementById("documentCount").textContent = formatNumber(data.stats.totalDocuments);
  document.getElementById("documentCharacters").textContent = formatNumber(data.stats.totalCharacters);
  document.getElementById("documentKeywordCount").textContent = formatNumber(data.stats.keywords.length);
  renderKeywordCloud(data.stats.keywords);
  const selected = ragDocuments.find((document) => document.id === selectedDocumentId) || null;
  if (selected) {
    setDocumentEditor(selected);
  } else {
    setDocumentEditor(null);
  }
  documentDashboard.hidden = false;
}

async function loadRagDocuments() {
  const password = documentAdminPassword.value;
  const data = await requestJson(`/api/admin/rag-documents?password=${encodeURIComponent(password)}`);
  renderDocumentDashboard(data);
}

documentAdminLoadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadRagDocuments();
  } catch (error) {
    alert(error.message);
  }
});

newDocumentButton.addEventListener("click", () => {
  setDocumentEditor(null);
  documentId.focus();
});

documentForm.addEventListener("input", () => {
  documentContentLength.textContent = formatNumber(documentContent.value.length);
  documentSaveStatus.textContent = "수정됨";
  documentSaveStatus.className = "save-status changed";
});

documentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveDocumentButton.disabled = true;
  saveDocumentButton.textContent = "저장 중...";
  const payload = {
    password: documentAdminPassword.value,
    document: {
      id: documentId.value,
      title: documentTitle.value,
      source: documentSource.value,
      content: documentContent.value
    }
  };

  try {
    const url = selectedDocumentId
      ? `/api/admin/rag-documents/${encodeURIComponent(selectedDocumentId)}`
      : "/api/admin/rag-documents";
    const data = await requestJson(url, {
      method: selectedDocumentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    selectedDocumentId = data.document.id;
    await loadRagDocuments();
    documentSaveStatus.textContent = "저장됨";
    documentSaveStatus.className = "save-status saved";
  } catch (error) {
    alert(error.message);
  } finally {
    saveDocumentButton.disabled = false;
    saveDocumentButton.textContent = "문서 저장";
  }
});

deleteDocumentButton.addEventListener("click", async () => {
  if (!selectedDocumentId || !window.confirm("이 문서를 RAG 지식 베이스에서 삭제할까요?")) {
    return;
  }
  try {
    await requestJson(`/api/admin/rag-documents/${encodeURIComponent(selectedDocumentId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: documentAdminPassword.value })
    });
    selectedDocumentId = null;
    await loadRagDocuments();
  } catch (error) {
    alert(error.message);
  }
});

adminLoadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const password = adminPassword.value;
    const data = await requestJson(`/api/admin/prompts?password=${encodeURIComponent(password)}`);
    Object.entries(data).forEach(([key, value]) => {
      const field = document.getElementById(key);
      if (field) {
        field.value = value;
      }
    });
    adminSaveForm.hidden = false;
  } catch (error) {
    alert(error.message);
  }
});

adminSaveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await requestJson("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: adminPassword.value,
        fortuneSystemPrompt: document.getElementById("fortuneSystemPrompt").value,
        fortuneUserPromptTemplate: document.getElementById("fortuneUserPromptTemplate").value,
        ragSystemPrompt: document.getElementById("ragSystemPrompt").value
      })
    });
    alert("프롬프트가 저장되었습니다.");
  } catch (error) {
    alert(error.message);
  }
});

async function checkHealth() {
  try {
    const data = await requestJson("/api/health");
    healthBadge.className = `health-badge ${data.demoMode ? "pending" : "ok"}`;
    healthBadge.textContent = data.demoMode ? "Demo Mode" : "CLOVA Connected";
  } catch (error) {
    healthBadge.className = "health-badge fail";
    healthBadge.textContent = "API Error";
  }
}

checkHealth();
