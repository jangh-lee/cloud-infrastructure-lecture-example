(function () {
  "use strict";

  const API_ORIGIN = "https://billingapi.apigw.ntruss.com";
  const API_PATH = "/billing/v1/cost/getDemandCostList";
  const encoder = new TextEncoder();

  function partsAt(date, timeZone) {
    return Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
  }

  function currentKstMonth() {
    const parts = partsAt(new Date(), "Asia/Seoul");
    return `${parts.year}-${parts.month}`;
  }

  function currentKstInput() {
    const parts = partsAt(new Date(), "Asia/Seoul");
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function formatTime(timestamp, timeZone) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
      hourCycle: "h23",
    }).format(new Date(Number(timestamp)));
  }

  function toBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  async function makeSignature(secretKey, message) {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return toBase64(new Uint8Array(signature));
  }

  function monthValue(input) {
    return input.value.replace("-", "");
  }

  function validateMonths(startMonth, endMonth) {
    if (!/^\d{6}$/.test(startMonth) || !/^\d{6}$/.test(endMonth)) {
      throw new Error("조회 시작 월과 마지막 월을 입력하세요.");
    }
    const startIndex = Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(4, 6));
    const endIndex = Number(endMonth.slice(0, 4)) * 12 + Number(endMonth.slice(4, 6));
    if (endIndex < startIndex || endIndex - startIndex > 2) {
      throw new Error("시작 월부터 최대 3개월까지 조회할 수 있습니다.");
    }
  }

  function init(root) {
    if (root.dataset.ready === "true") {
      return;
    }
    root.dataset.ready = "true";
    root.classList.add("ncp-cost-tool");
    root.innerHTML = `
      <section class="ncp-tool-hero">
        <p class="ncp-tool-kicker">NCP COST &amp; USAGE</p>
        <h3>Signature V2 요청 제작기</h3>
        <p>시간을 선택하고 키를 입력하면 서명, 필수 헤더, curl을 즉시 만듭니다.</p>
      </section>

      <div class="ncp-tool-grid">
        <section class="ncp-tool-panel">
          <span class="ncp-tool-step">01 / TIME</span>
          <h4>timestamp 만들기</h4>
          <div class="ncp-tool-actions">
            <button type="button" class="md-button md-button--primary" data-action="now">현재 시각 사용</button>
          </div>
          <label>입력 날짜와 시간
            <input type="datetime-local" step="1" data-field="custom-time">
          </label>
          <label>입력 시간대
            <select data-field="timezone">
              <option value="+09:00">KST (UTC+09:00)</option>
              <option value="Z">UTC</option>
              <option value="local">브라우저 로컬 시간</option>
            </select>
          </label>
          <button type="button" class="md-button" data-action="custom-time">입력 시각 사용</button>
          <div class="ncp-time-output" aria-live="polite">
            <strong data-output="timestamp">-</strong>
            <span data-output="kst">KST: -</span>
            <span data-output="utc">UTC: -</span>
          </div>
        </section>

        <section class="ncp-tool-panel">
          <span class="ncp-tool-step">02 / SIGN</span>
          <h4>서명과 헤더 만들기</h4>
          <label>Access Key
            <input type="text" autocomplete="off" spellcheck="false" data-field="access-key" placeholder="NCP Access Key">
          </label>
          <label>Secret Key
            <input type="password" autocomplete="new-password" spellcheck="false" data-field="secret-key" placeholder="현재 탭에서만 사용">
          </label>
          <div class="ncp-tool-columns">
            <label>시작 월
              <input type="month" data-field="start-month">
            </label>
            <label>마지막 월
              <input type="month" data-field="end-month">
            </label>
          </div>
          <button type="button" class="md-button md-button--primary" data-action="sign">서명과 헤더 만들기</button>
          <p class="ncp-tool-note">Secret Key는 저장하거나 네트워크로 전송하지 않습니다.</p>
        </section>
      </div>

      <section class="ncp-tool-panel ncp-tool-output-panel">
        <span class="ncp-tool-step">03 / REQUEST</span>
        <h4>생성 결과</h4>
        <div class="ncp-result-tabs">
          <button type="button" data-tab="message" class="is-active">서명 원문</button>
          <button type="button" data-tab="signature">Signature</button>
          <button type="button" data-tab="headers">Headers</button>
          <button type="button" data-tab="curl">curl</button>
        </div>
        <pre><code data-output="request">아직 생성되지 않았습니다.</code></pre>
        <button type="button" class="md-button ncp-copy-button" data-action="copy">현재 결과 복사</button>
      </section>

      <section class="ncp-tool-panel ncp-tool-proxy">
        <span class="ncp-tool-step">04 / RUN</span>
        <h4>비용 API 바로 조회</h4>
        <p>키는 Cloud Functions의 암호화 파라미터에 두고, 여기에는 프록시 호출 정보만 입력합니다.</p>
        <label>Cloud Functions 프록시 URL
          <input type="url" autocomplete="off" data-field="proxy-url" placeholder="https://...apigw.ntruss.com/...">
        </label>
        <label>도구 토큰
          <input type="password" autocomplete="new-password" data-field="proxy-token" placeholder="WEB_TOOL_TOKEN">
        </label>
        <button type="button" class="md-button md-button--primary" data-action="run">비용 조회</button>
        <p class="ncp-tool-status" data-output="status" aria-live="polite">대기 중</p>
        <pre><code data-output="response">API 응답이 여기에 표시됩니다.</code></pre>
      </section>
    `;

    const fields = {
      customTime: root.querySelector('[data-field="custom-time"]'),
      timezone: root.querySelector('[data-field="timezone"]'),
      accessKey: root.querySelector('[data-field="access-key"]'),
      secretKey: root.querySelector('[data-field="secret-key"]'),
      startMonth: root.querySelector('[data-field="start-month"]'),
      endMonth: root.querySelector('[data-field="end-month"]'),
      proxyUrl: root.querySelector('[data-field="proxy-url"]'),
      proxyToken: root.querySelector('[data-field="proxy-token"]'),
    };
    const outputs = {
      timestamp: root.querySelector('[data-output="timestamp"]'),
      kst: root.querySelector('[data-output="kst"]'),
      utc: root.querySelector('[data-output="utc"]'),
      request: root.querySelector('[data-output="request"]'),
      status: root.querySelector('[data-output="status"]'),
      response: root.querySelector('[data-output="response"]'),
    };
    const state = {
      timestamp: String(Date.now()),
      useCurrentTime: true,
      activeTab: "message",
      results: {},
    };

    fields.customTime.value = currentKstInput();
    fields.startMonth.value = currentKstMonth();
    fields.endMonth.value = currentKstMonth();

    function showTimestamp(timestamp) {
      state.timestamp = String(timestamp);
      outputs.timestamp.textContent = state.timestamp;
      outputs.kst.textContent = `KST: ${formatTime(state.timestamp, "Asia/Seoul")}`;
      outputs.utc.textContent = `UTC: ${formatTime(state.timestamp, "UTC")}`;
    }

    function setStatus(message, kind) {
      outputs.status.textContent = message;
      outputs.status.dataset.kind = kind || "idle";
    }

    function showTab(name) {
      state.activeTab = name;
      root.querySelectorAll("[data-tab]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === name);
      });
      outputs.request.textContent = state.results[name] || "아직 생성되지 않았습니다.";
    }

    root.querySelector('[data-action="now"]').addEventListener("click", () => {
      state.useCurrentTime = true;
      fields.customTime.value = currentKstInput();
      showTimestamp(Date.now());
    });

    root.querySelector('[data-action="custom-time"]').addEventListener("click", () => {
      const raw = fields.customTime.value;
      if (!raw) {
        setStatus("입력 날짜와 시간을 선택하세요.", "error");
        return;
      }
      const normalized = raw.length === 16 ? `${raw}:00` : raw;
      const date = fields.timezone.value === "local"
        ? new Date(normalized)
        : new Date(`${normalized}${fields.timezone.value}`);
      if (Number.isNaN(date.getTime())) {
        setStatus("입력 시각을 변환할 수 없습니다.", "error");
        return;
      }
      state.useCurrentTime = false;
      showTimestamp(date.getTime());
      setStatus("입력 시각을 timestamp로 변환했습니다.", "success");
    });

    root.querySelector('[data-action="sign"]').addEventListener("click", async () => {
      try {
        const accessKey = fields.accessKey.value.trim();
        const secretKey = fields.secretKey.value;
        if (!accessKey || !secretKey) {
          throw new Error("Access Key와 Secret Key를 입력하세요.");
        }

        const startMonth = monthValue(fields.startMonth);
        const endMonth = monthValue(fields.endMonth);
        validateMonths(startMonth, endMonth);
        if (state.useCurrentTime) {
          showTimestamp(Date.now());
        }

        const query = new URLSearchParams({
          startMonth,
          endMonth,
          responseFormatType: "json",
        }).toString();
        const uri = `${API_PATH}?${query}`;
        const message = `GET ${uri}\n${state.timestamp}\n${accessKey}`;
        const signature = await makeSignature(secretKey, message);
        const headers = {
          "x-ncp-apigw-timestamp": state.timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": signature,
        };
        const curl = [
          `curl --request GET '${API_ORIGIN}${uri}' \\`,
          `  --header 'x-ncp-apigw-timestamp: ${state.timestamp}' \\`,
          `  --header 'x-ncp-iam-access-key: ${accessKey}' \\`,
          `  --header 'x-ncp-apigw-signature-v2: ${signature}'`,
        ].join("\n");

        state.results = {
          message,
          signature,
          headers: JSON.stringify(headers, null, 2),
          curl,
        };
        showTab(state.activeTab);
        setStatus("서명과 필수 헤더를 만들었습니다.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    });

    root.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      if (!state.results[state.activeTab]) {
        setStatus("먼저 서명과 헤더를 만드세요.", "error");
        return;
      }
      await navigator.clipboard.writeText(state.results[state.activeTab]);
      setStatus("현재 결과를 클립보드에 복사했습니다.", "success");
    });

    root.querySelector('[data-action="run"]').addEventListener("click", async () => {
      try {
        const proxyUrl = fields.proxyUrl.value.trim();
        const proxyToken = fields.proxyToken.value;
        const startMonth = monthValue(fields.startMonth);
        const endMonth = monthValue(fields.endMonth);
        validateMonths(startMonth, endMonth);
        if (!proxyUrl || !proxyToken) {
          throw new Error("Cloud Functions 프록시 URL과 도구 토큰을 입력하세요.");
        }
        if (!/^https:\/\//i.test(proxyUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(proxyUrl)) {
          throw new Error("프록시 URL은 HTTPS 주소를 사용하세요.");
        }

        setStatus("Billing API를 조회하고 있습니다.", "loading");
        outputs.response.textContent = "요청 중...";
        const response = await fetch(proxyUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${proxyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ startMonth, endMonth }),
          cache: "no-store",
        });
        const text = await response.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch (error) {
          // Keep plain text responses visible.
        }
        outputs.response.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        setStatus(`HTTP ${response.status} ${response.ok ? "조회 완료" : "조회 실패"}`, response.ok ? "success" : "error");
      } catch (error) {
        outputs.response.textContent = error.message;
        setStatus(error.message, "error");
      }
    });

    showTimestamp(state.timestamp);
  }

  function initAll() {
    document.querySelectorAll("[data-ncp-cost-api-tool]").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(initAll);
  }
})();
