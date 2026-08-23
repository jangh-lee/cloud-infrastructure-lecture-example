const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "todos.json");
const publicDir = path.join(__dirname, "public");
const eventClients = new Set();

app.use(express.json());
app.use(express.static(publicDir));

const defaultTodos = [
  {
    id: "todo-1",
    title: "Postman으로 GET /api/todos 호출하기",
    note: "응답 구조를 먼저 확인해 보세요.",
    weather: "sunny",
    plannedHour: "09",
    plannedMinute: "30",
    checkedHour: "",
    checkedMinute: "",
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "todo-2",
    title: "새 할 일을 POST로 추가하기",
    note: "JSON body로 title 값을 보내세요.",
    weather: "cloudy",
    plannedHour: "11",
    plannedMinute: "00",
    checkedHour: "",
    checkedMinute: "",
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "todo-3",
    title: "완료 여부를 PUT 또는 PATCH로 바꾸기",
    note: "done 필드를 true로 변경해 보세요.",
    weather: "rainy",
    plannedHour: "15",
    plannedMinute: "00",
    checkedHour: "",
    checkedMinute: "",
    done: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultTodos, null, 2));
  }
}

async function readTodos() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeTodos(todos) {
  await fs.writeFile(dataFile, JSON.stringify(todos, null, 2));
}

function normalizeTodoPayload(payload = {}, existing = {}) {
  return {
    title: String(payload.title ?? existing.title ?? "").trim(),
    note: String(payload.note ?? existing.note ?? "").trim(),
    weather: String(payload.weather ?? existing.weather ?? "sunny").trim(),
    plannedHour: String(payload.plannedHour ?? existing.plannedHour ?? "").trim(),
    plannedMinute: String(payload.plannedMinute ?? existing.plannedMinute ?? "").trim(),
    checkedHour: String(payload.checkedHour ?? existing.checkedHour ?? "").trim(),
    checkedMinute: String(payload.checkedMinute ?? existing.checkedMinute ?? "").trim(),
    done: Boolean(payload.done ?? existing.done ?? false)
  };
}

function createId() {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function broadcastTodoChange(type, todoId) {
  const payload = JSON.stringify({
    type,
    todoId,
    timestamp: new Date().toISOString()
  });

  for (const client of eventClients) {
    client.write(`event: todos-updated\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "chapter1-api-server" });
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`event: connected\n`);
  res.write(`data: {"status":"connected"}\n\n`);

  eventClients.add(res);

  const keepAliveTimer = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    eventClients.delete(res);
  });
});

app.get("/api/todos", async (req, res, next) => {
  try {
    const todos = await readTodos();
    res.json(todos);
  } catch (error) {
    next(error);
  }
});

app.get("/api/todos/:id", async (req, res, next) => {
  try {
    const todos = await readTodos();
    const todo = todos.find((item) => item.id === req.params.id);

    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    next(error);
  }
});

app.post("/api/todos", async (req, res, next) => {
  try {
    const todos = await readTodos();
    const payload = normalizeTodoPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ message: "title is required" });
    }

    const now = new Date().toISOString();
    const todo = {
      id: createId(),
      ...payload,
      createdAt: now,
      updatedAt: now
    };

    todos.unshift(todo);
    await writeTodos(todos);
    broadcastTodoChange("created", todo.id);
    res.status(201).json(todo);
  } catch (error) {
    next(error);
  }
});

app.put("/api/todos/:id", async (req, res, next) => {
  try {
    const todos = await readTodos();
    const index = todos.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const payload = normalizeTodoPayload(req.body, todos[index]);

    if (!payload.title) {
      return res.status(400).json({ message: "title is required" });
    }

    const updatedTodo = {
      ...todos[index],
      ...payload,
      updatedAt: new Date().toISOString()
    };

    todos[index] = updatedTodo;
    await writeTodos(todos);
    broadcastTodoChange("replaced", updatedTodo.id);
    res.json(updatedTodo);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/todos/:id", async (req, res, next) => {
  try {
    const todos = await readTodos();
    const index = todos.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: "Todo not found" });
    }

    const updatedTodo = {
      ...todos[index],
      ...normalizeTodoPayload(req.body, todos[index]),
      updatedAt: new Date().toISOString()
    };

    if (!updatedTodo.title) {
      return res.status(400).json({ message: "title is required" });
    }

    todos[index] = updatedTodo;
    await writeTodos(todos);
    broadcastTodoChange("updated", updatedTodo.id);
    res.json(updatedTodo);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/todos/:id", async (req, res, next) => {
  try {
    const todos = await readTodos();
    const remainingTodos = todos.filter((item) => item.id !== req.params.id);

    if (remainingTodos.length === todos.length) {
      return res.status(404).json({ message: "Todo not found" });
    }

    await writeTodos(remainingTodos);
    broadcastTodoChange("deleted", req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/guide", (req, res) => {
  res.sendFile(path.join(publicDir, "guide.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

ensureDataFile()
  .then(() => {
    app.listen(port, () => {
      console.log(`Chapter 1 server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize data file", error);
    process.exit(1);
  });
