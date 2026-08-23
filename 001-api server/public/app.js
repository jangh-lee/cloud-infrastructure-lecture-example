const monthValue = document.getElementById("monthValue");
const dayValue = document.getElementById("dayValue");
const weekdayValue = document.getElementById("weekdayValue");
const todoList = document.getElementById("todoList");
const todoForm = document.getElementById("todoForm");
const editForm = document.getElementById("editForm");
const preview = document.getElementById("selectedPreview");
const weatherButtons = document.querySelectorAll(".weather-button");

const state = {
  todos: [],
  selectedId: null,
  selectedWeather: "sunny",
  eventSource: null
};

function setToday() {
  const today = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  monthValue.textContent = String(today.getMonth() + 1).padStart(2, "0");
  dayValue.textContent = String(today.getDate()).padStart(2, "0");
  weekdayValue.textContent = weekdays[today.getDay()];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(hour, minute) {
  if (!hour && !minute) {
    return "-";
  }

  return `${hour || "00"}:${minute || "00"}`;
}

function updatePreview(todo) {
  if (!todo) {
    preview.textContent = "할 일을 선택하면 여기 표시됩니다.";
    return;
  }

  preview.textContent = JSON.stringify(todo, null, 2);
}

function fillEditForm(todo) {
  if (!todo) {
    editForm.reset();
    document.getElementById("editId").value = "";
    updatePreview(null);
    return;
  }

  document.getElementById("editId").value = todo.id;
  document.getElementById("editTitle").value = todo.title;
  document.getElementById("editNote").value = todo.note;
  document.getElementById("editPlannedHour").value = todo.plannedHour;
  document.getElementById("editPlannedMinute").value = todo.plannedMinute;
  document.getElementById("editCheckedHour").value = todo.checkedHour;
  document.getElementById("editCheckedMinute").value = todo.checkedMinute;
  document.getElementById("editDone").value = String(todo.done);
  updatePreview(todo);
}

function renderTodos() {
  todoList.innerHTML = state.todos
    .map((todo) => {
      const doneClass = todo.done ? "done" : "";
      const safeTitle = escapeHtml(todo.title);
      const safeNote = escapeHtml(todo.note);

      return `
        <li class="todo-item ${doneClass}">
          <button
            class="todo-radio"
            data-toggle-id="${todo.id}"
            type="button"
            aria-label="${todo.done ? "할 일을 진행중으로 변경" : "할 일을 완료 처리"}"
            title="${todo.done ? "진행중으로 변경" : "완료 처리"}"
          ></button>
          <div class="todo-main" data-select-id="${todo.id}">
            <strong>${safeTitle}</strong>
            <div class="todo-meta">
              <span>날씨 ${escapeHtml(todo.weather)}</span>
              <span>예정 ${formatTime(todo.plannedHour, todo.plannedMinute)}</span>
              <span>체크 ${formatTime(todo.checkedHour, todo.checkedMinute)}</span>
            </div>
            <div class="todo-note">${safeNote || "메모 없음"}</div>
          </div>
          <div class="todo-actions">
            <button class="ghost-button danger" data-delete-id="${todo.id}" type="button">삭제</button>
          </div>
        </li>
      `;
    })
    .join("");
}

async function fetchTodos() {
  const response = await fetch("/api/todos");
  state.todos = await response.json();
  renderTodos();

  const selectedTodo = state.todos.find((todo) => todo.id === state.selectedId);
  fillEditForm(selectedTodo || state.todos[0] || null);

  if (!selectedTodo && state.todos[0]) {
    state.selectedId = state.todos[0].id;
    fillEditForm(state.todos[0]);
  }
}

function subscribeToTodoEvents() {
  if (!window.EventSource) {
    return;
  }

  state.eventSource = new EventSource("/api/events");

  state.eventSource.addEventListener("todos-updated", async () => {
    await fetchTodos();
  });
}

async function createTodo(event) {
  event.preventDefault();

  const payload = {
    title: document.getElementById("titleInput").value.trim(),
    note: document.getElementById("noteInput").value.trim(),
    weather: state.selectedWeather,
    plannedHour: document.getElementById("plannedHourInput").value.trim(),
    plannedMinute: document.getElementById("plannedMinuteInput").value.trim(),
    checkedHour: "",
    checkedMinute: "",
    done: false
  };

  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    alert("할 일 생성에 실패했습니다.");
    return;
  }

  todoForm.reset();
  await fetchTodos();
}

async function updateTodo(event) {
  event.preventDefault();

  const id = document.getElementById("editId").value;

  if (!id) {
    alert("먼저 수정할 항목을 선택하세요.");
    return;
  }

  const payload = {
    title: document.getElementById("editTitle").value.trim(),
    note: document.getElementById("editNote").value.trim(),
    plannedHour: document.getElementById("editPlannedHour").value.trim(),
    plannedMinute: document.getElementById("editPlannedMinute").value.trim(),
    checkedHour: document.getElementById("editCheckedHour").value.trim(),
    checkedMinute: document.getElementById("editCheckedMinute").value.trim(),
    done: document.getElementById("editDone").value === "true"
  };

  const originalTodo = state.todos.find((todo) => todo.id === id);
  payload.weather = originalTodo?.weather || "sunny";

  const response = await fetch(`/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    alert("할 일 수정에 실패했습니다.");
    return;
  }

  await fetchTodos();
}

async function toggleTodo(id) {
  const todo = state.todos.find((item) => item.id === id);

  if (!todo) {
    return;
  }

  const now = new Date();
  const payload = {
    done: !todo.done,
    checkedHour: !todo.done ? String(now.getHours()).padStart(2, "0") : "",
    checkedMinute: !todo.done ? String(now.getMinutes()).padStart(2, "0") : ""
  };

  const response = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    alert("상태 변경에 실패했습니다.");
    return;
  }

  await fetchTodos();
}

async function deleteTodo(id) {
  const response = await fetch(`/api/todos/${id}`, { method: "DELETE" });

  if (!response.ok) {
    alert("삭제에 실패했습니다.");
    return;
  }

  if (state.selectedId === id) {
    state.selectedId = null;
  }

  await fetchTodos();
}

todoForm.addEventListener("submit", createTodo);
editForm.addEventListener("submit", updateTodo);

todoList.addEventListener("click", async (event) => {
  const selectButton = event.target.closest("[data-select-id]");
  const toggleButton = event.target.closest("[data-toggle-id]");
  const deleteButton = event.target.closest("[data-delete-id]");

  if (selectButton) {
    state.selectedId = selectButton.dataset.selectId;
    const todo = state.todos.find((item) => item.id === state.selectedId);
    fillEditForm(todo || null);
    return;
  }

  if (toggleButton) {
    await toggleTodo(toggleButton.dataset.toggleId);
    return;
  }

  if (deleteButton) {
    await deleteTodo(deleteButton.dataset.deleteId);
  }
});

weatherButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedWeather = button.dataset.weather;
    weatherButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

setToday();
fetchTodos();
subscribeToTodoEvents();
