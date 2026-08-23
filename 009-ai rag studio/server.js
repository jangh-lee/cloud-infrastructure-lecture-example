const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4100);
const publicDir = path.join(__dirname, "public");
const configPath = path.join(__dirname, "data", "prompt-config.json");
const ragDocumentsPath = path.join(__dirname, "data", "rag-documents.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function requireEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function isDemoMode() {
  return !requireEnv("CLOVA_API_KEY") && String(process.env.DEMO_MODE_IF_NO_KEY || "true") === "true";
}

async function readPromptConfig() {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

async function writePromptConfig(data) {
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
}

async function readRagDocuments() {
  const raw = await fs.readFile(ragDocumentsPath, "utf8");
  return JSON.parse(raw);
}

async function writeRagDocuments(documents) {
  const temporaryPath = `${ragDocumentsPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(documents, null, 2)}\n`);
  await fs.rename(temporaryPath, ragDocumentsPath);
}

function requireAdminPassword(value) {
  return value === requireEnv("ADMIN_PASSWORD");
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateRagDocument(input, fixedId = "") {
  const document = {
    id: String(fixedId || input?.id || "").trim(),
    title: String(input?.title || "").trim(),
    source: String(input?.source || "").trim(),
    content: String(input?.content || "").trim()
  };

  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(document.id)) {
    throw createHttpError(400, "문서 ID는 영문 소문자, 숫자, 하이픈으로 2~80자까지 입력하세요.");
  }
  if (!document.title || document.title.length > 120) {
    throw createHttpError(400, "문서 제목은 1~120자로 입력하세요.");
  }
  if (!document.source || document.source.length > 300) {
    throw createHttpError(400, "출처는 1~300자로 입력하세요.");
  }
  if (!document.content || document.content.length > 50000) {
    throw createHttpError(400, "문서 내용은 1~50,000자로 입력하세요.");
  }
  return document;
}

function applyTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model response did not contain JSON");
    }
    return JSON.parse(match[0]);
  }
}

async function callClovaChat({ modelName, messages }) {
  const apiKey = requireEnv("CLOVA_API_KEY");
  const baseUrl = requireEnv("CLOVA_BASE_URL") || "https://clovastudio.stream.ntruss.com";

  if (!apiKey) {
    throw new Error("CLOVA_API_KEY is missing");
  }

  const response = await fetch(`${baseUrl}/v3/chat-completions/${modelName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-NCP-CLOVASTUDIO-REQUEST-ID": `chapter4-${Date.now()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      topP: 0.8,
      topK: 0,
      maxTokens: 900,
      temperature: 0.6,
      repetitionPenalty: 1.1,
      includeAiFilters: false
    })
  });

  const data = await response.json();
  if (!response.ok || data.status?.code !== "20000") {
    throw new Error(data.status?.message || `CLOVA request failed with status ${response.status}`);
  }

  return data.result.message.content;
}

async function callRagReasoning(messages) {
  const apiKey = requireEnv("CLOVA_API_KEY");
  const baseUrl = requireEnv("CLOVA_BASE_URL") || "https://clovastudio.stream.ntruss.com";
  if (!apiKey) {
    throw new Error("CLOVA_API_KEY is missing");
  }

  const response = await fetch(`${baseUrl}/v1/api-tools/rag-reasoning`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-NCP-CLOVASTUDIO-REQUEST-ID": `chapter4-rag-${Date.now()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "tutorial_document_search",
            description: "Web Server Tutorial 실습 문서에서 질문과 관련된 내용을 검색합니다. 질문을 여러 주제로 나누어야 하면 검색어를 나누어 호출합니다. 검색 결과에 없는 내용은 추측하지 않습니다.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "실습 문서에서 찾을 핵심 검색어"
                }
              },
              required: ["query"]
            }
          }
        }
      ],
      toolChoice: "auto",
      topP: 0.8,
      topK: 0,
      maxTokens: 1024,
      temperature: 0.5,
      repetitionPenalty: 1.1,
      stop: [],
      seed: 0,
      includeAiFilters: true
    })
  });

  const data = await response.json();
  if (!response.ok || data.status?.code !== "20000") {
    throw new Error(data.status?.message || `RAG Reasoning request failed with status ${response.status}`);
  }
  return data.result;
}

function tokenize(value) {
  const stopWords = new Set(["어떻게", "알려줘", "무엇", "대한", "관련", "방법", "하는", "에서", "으로"]);
  return [...new Set((String(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [])
    .filter((token) => !stopWords.has(token)))];
}

async function searchTutorialDocuments(query) {
  const documents = await readRagDocuments();
  const tokens = tokenize(query);
  const scored = documents.map((document) => {
    const title = document.title.toLowerCase();
    const content = document.content.toLowerCase();
    const score = tokens.reduce((total, token) => {
      const titleMatches = title.split(token).length - 1;
      const contentMatches = content.split(token).length - 1;
      return total + titleMatches * 4 + contentMatches;
    }, 0);
    return { ...document, score };
  });

  const matches = scored.filter((document) => document.score > 0).sort((a, b) => b.score - a.score);
  return matches.slice(0, 3).map(({ score, ...document }) => document);
}

function summarizeRagDocuments(documents) {
  const ignored = new Set(["chapter", "실습", "서버", "사용", "한다", "있다", "대한", "관련", "문서"]);
  const frequencies = new Map();
  documents.forEach((document) => {
    tokenize(`${document.title} ${document.content}`).forEach((token) => {
      if (!ignored.has(token)) {
        frequencies.set(token, (frequencies.get(token) || 0) + 1);
      }
    });
  });

  return {
    totalDocuments: documents.length,
    totalCharacters: documents.reduce((total, document) => total + document.content.length, 0),
    keywords: [...frequencies.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .slice(0, 12)
      .map(([keyword, count]) => ({ keyword, count }))
  };
}

function parseToolArguments(value) {
  if (value && typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function createSourceExcerpt(content, query) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  const tokens = tokenize(query);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const bestSentence = sentences
    .map((sentence) => ({
      sentence,
      score: tokens.reduce((total, token) => total + (sentence.toLowerCase().includes(token) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score)[0]?.sentence || text;
  return bestSentence.length > 280 ? `${bestSentence.slice(0, 277)}...` : bestSentence;
}

function normalizeRagCitations(answer, sources) {
  const citationIndexes = new Map(sources.map((source, index) => [source.id, index + 1]));
  return String(answer || "").replace(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g, (_, id, content) => {
    const citationNumber = citationIndexes.get(id);
    return citationNumber ? `${content} [${citationNumber}]` : content;
  });
}

async function answerRagQuestion(clientMessages, systemPrompt) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...clientMessages
  ];
  const sourceMap = new Map();
  const searchQueries = [];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (let step = 0; step < 4; step += 1) {
    const result = await callRagReasoning(messages);
    usage.promptTokens += result.usage?.promptTokens || 0;
    usage.completionTokens += result.usage?.completionTokens || 0;
    usage.totalTokens += result.usage?.totalTokens || 0;

    const modelMessage = result.message || {};
    const toolCalls = Array.isArray(modelMessage.toolCalls) ? modelMessage.toolCalls : [];
    if (!toolCalls.length) {
      const sources = [...sourceMap.values()];
      return {
        answer: normalizeRagCitations(modelMessage.content || "검색 문서에서 답변을 찾지 못했습니다.", sources),
        sources,
        searchQueries,
        usage
      };
    }

    messages.push({
      role: "assistant",
      content: modelMessage.content || "",
      toolCalls
    });

    for (const toolCall of toolCalls) {
      const args = parseToolArguments(toolCall.function?.arguments);
      const query = String(args.query || "").trim();
      const documents = query ? await searchTutorialDocuments(query) : [];
      if (query) {
        searchQueries.push(query);
      }
      documents.forEach((document) => {
        if (!sourceMap.has(document.id)) {
          sourceMap.set(document.id, {
            id: document.id,
            title: document.title,
            source: document.source,
            excerpt: createSourceExcerpt(document.content, query),
            query
          });
        }
      });
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify([
          {
            search_result: documents.map((document) => ({
              id: document.id,
              doc: document.content,
              title: document.title,
              url: document.source
            }))
          }
        ])
      });
    }
  }

  throw new Error("RAG Reasoning exceeded the maximum search steps");
}

async function makeMockRagAnswer(question) {
  const documents = await searchTutorialDocuments(question);
  const context = documents[0];
  return {
    answer: context
      ? `${context.content} [1]\n\n데모 모드에서는 검색된 실습 문서를 그대로 요약해 보여줍니다.`
      : "관련된 실습 문서를 찾지 못했습니다. Chapter, 서버 역할 또는 설정 이름을 포함해 질문해 보세요.",
    sources: documents.map(({ id, title, source, content }) => ({
      id,
      title,
      source,
      excerpt: createSourceExcerpt(content, question),
      query: question
    })),
    searchQueries: [question],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  };
}

function makeMockFortune(payload) {
  return {
    title: "오늘의 별빛 흐름",
    summary: `${payload.birthMonth}월의 부드러운 기운이 들어오는 날입니다. 서두르기보다 순서를 지키면 운이 편안하게 흐릅니다.`,
    energyFlow: "아침보다 오후에 감이 더 또렷해지고, 사람과의 대화에서 힌트를 얻는 흐름입니다.",
    strength: "차분하게 상황을 정리하는 힘이 강합니다.",
    caution: "마감 직전의 즉흥 결정은 조금 늦추는 것이 좋습니다.",
    luckyColor: "민트 블루",
    luckyDirection: "동남",
    luckyTime: "오후 3시~5시",
    score: 82,
    keywords: ["정리", "대화운", "집중"]
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "chapter4-ai-studio-demo",
    demoMode: isDemoMode()
  });
});

app.get("/api/admin/prompts", async (req, res, next) => {
  try {
    if (req.query.password !== requireEnv("ADMIN_PASSWORD")) {
      return res.status(403).json({ message: "Invalid admin password" });
    }

    res.json(await readPromptConfig());
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/prompts", async (req, res, next) => {
  try {
    if (req.body.password !== requireEnv("ADMIN_PASSWORD")) {
      return res.status(403).json({ message: "Invalid admin password" });
    }

    const nextConfig = {
      fortuneSystemPrompt: String(req.body.fortuneSystemPrompt || ""),
      fortuneUserPromptTemplate: String(req.body.fortuneUserPromptTemplate || ""),
      ragSystemPrompt: String(req.body.ragSystemPrompt || "")
    };

    await writePromptConfig(nextConfig);
    res.json({ status: "saved" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/rag-documents", async (req, res, next) => {
  try {
    if (!requireAdminPassword(req.query.password)) {
      return res.status(403).json({ message: "Invalid admin password" });
    }
    const documents = await readRagDocuments();
    res.json({ documents, stats: summarizeRagDocuments(documents) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rag-documents", async (req, res, next) => {
  try {
    if (!requireAdminPassword(req.body.password)) {
      return res.status(403).json({ message: "Invalid admin password" });
    }
    const documents = await readRagDocuments();
    const document = validateRagDocument(req.body.document);
    if (documents.some((item) => item.id === document.id)) {
      throw createHttpError(409, "이미 사용 중인 문서 ID입니다.");
    }
    documents.push(document);
    await writeRagDocuments(documents);
    res.status(201).json({ document, stats: summarizeRagDocuments(documents) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/rag-documents/:id", async (req, res, next) => {
  try {
    if (!requireAdminPassword(req.body.password)) {
      return res.status(403).json({ message: "Invalid admin password" });
    }
    const documents = await readRagDocuments();
    const index = documents.findIndex((item) => item.id === req.params.id);
    if (index < 0) {
      throw createHttpError(404, "문서를 찾을 수 없습니다.");
    }
    const document = validateRagDocument(req.body.document, req.params.id);
    documents[index] = document;
    await writeRagDocuments(documents);
    res.json({ document, stats: summarizeRagDocuments(documents) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/rag-documents/:id", async (req, res, next) => {
  try {
    if (!requireAdminPassword(req.body.password)) {
      return res.status(403).json({ message: "Invalid admin password" });
    }
    const documents = await readRagDocuments();
    const nextDocuments = documents.filter((item) => item.id !== req.params.id);
    if (nextDocuments.length === documents.length) {
      throw createHttpError(404, "문서를 찾을 수 없습니다.");
    }
    await writeRagDocuments(nextDocuments);
    res.json({ status: "deleted", stats: summarizeRagDocuments(nextDocuments) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/fortune", async (req, res, next) => {
  try {
    const payload = {
      birthYear: req.body.birthYear,
      birthMonth: req.body.birthMonth,
      birthDay: req.body.birthDay,
      birthHour: req.body.birthHour,
      calendarType: req.body.calendarType || "양력",
      todayDate: new Date().toLocaleDateString("ko-KR")
    };

    if (!payload.birthYear || !payload.birthMonth || !payload.birthDay || !payload.birthHour) {
      return res.status(400).json({ message: "birthYear, birthMonth, birthDay, birthHour are required" });
    }

    if (isDemoMode()) {
      return res.json({ ...makeMockFortune(payload), source: "mock" });
    }

    const prompts = await readPromptConfig();
    const userPrompt = applyTemplate(prompts.fortuneUserPromptTemplate, payload);
    const content = await callClovaChat({
      modelName: requireEnv("CLOVA_TEXT_MODEL") || "HCX-DASH-002",
      messages: [
        { role: "system", content: prompts.fortuneSystemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    res.json({ ...extractJson(content), source: "clova" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rag/chat", async (req, res, next) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const safeMessages = messages
      .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
    const lastUserMessage = [...safeMessages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage?.content.trim()) {
      return res.status(400).json({ message: "A user question is required" });
    }

    if (isDemoMode()) {
      return res.json({ ...(await makeMockRagAnswer(lastUserMessage.content)), source: "mock-rag" });
    }

    const prompts = await readPromptConfig();
    const result = await answerRagQuestion(safeMessages, prompts.ragSystemPrompt);
    res.json({ ...result, source: "clova-rag-reasoning" });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ message: error.message || "Internal server error" });
});

app.listen(port, () => {
  console.log(`Chapter 4 AI Studio running on http://localhost:${port}`);
});
