const crypto = require("crypto");
const https = require("https");

const BILLING_HOST = "billingapi.apigw.ntruss.com";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function reply(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body,
  };
}

function parseBody(params) {
  if (params.startMonth || params.endMonth) {
    return params;
  }

  if (!params.__ow_body || typeof params.__ow_body !== "string") {
    return {};
  }

  try {
    const decoded = Buffer.from(params.__ow_body, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (error) {
    return {};
  }
}

function readBearerToken(params) {
  const headers = params.__ow_headers || {};
  const authorization = String(headers.authorization || headers.Authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function sameToken(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function monthIndex(value) {
  if (!/^\d{6}$/.test(value)) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  if (month < 1 || month > 12) {
    return null;
  }
  return year * 12 + month - 1;
}

function callBillingApi(uri, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: BILLING_HOST,
        port: 443,
        path: uri,
        method: "GET",
        headers,
        timeout: 15000,
      },
      (response) => {
        const chunks = [];
        let size = 0;

        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("Billing API response is too large"));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = text;
          try {
            data = JSON.parse(text);
          } catch (error) {
            // Preserve a non-JSON error response for troubleshooting.
          }

          resolve({
            statusCode: response.statusCode || 502,
            data,
          });
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("Billing API request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function main(params) {
  const method = String(params.__ow_method || "POST").toUpperCase();
  if (method === "OPTIONS") {
    return reply(204, "");
  }
  if (method !== "POST") {
    return reply(405, { ok: false, message: "POST 요청만 허용합니다." });
  }

  const accessKey = String(params.NCP_ACCESS_KEY || "");
  const secretKey = String(params.NCP_SECRET_KEY || "");
  const expectedToken = String(params.WEB_TOOL_TOKEN || "");
  if (!accessKey || !secretKey || !expectedToken) {
    return reply(500, {
      ok: false,
      message: "Cloud Functions 암호화 파라미터를 확인하세요.",
    });
  }

  if (!sameToken(readBearerToken(params), expectedToken)) {
    return reply(401, { ok: false, message: "도구 토큰이 올바르지 않습니다." });
  }

  const input = parseBody(params);
  const startMonth = String(input.startMonth || "");
  const endMonth = String(input.endMonth || "");
  const startIndex = monthIndex(startMonth);
  const endIndex = monthIndex(endMonth);

  if (startIndex === null || endIndex === null) {
    return reply(400, { ok: false, message: "조회 월은 yyyyMM 형식이어야 합니다." });
  }
  if (endIndex < startIndex || endIndex - startIndex > 2) {
    return reply(400, { ok: false, message: "시작 월부터 최대 3개월까지 조회할 수 있습니다." });
  }

  const query = new URLSearchParams({
    startMonth,
    endMonth,
    responseFormatType: "json",
  }).toString();
  const uri = `/billing/v1/cost/getDemandCostList?${query}`;
  const timestamp = String(Date.now());
  const message = `GET ${uri}\n${timestamp}\n${accessKey}`;
  const signature = crypto.createHmac("sha256", secretKey).update(message, "utf8").digest("base64");

  try {
    const result = await callBillingApi(uri, {
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": accessKey,
      "x-ncp-apigw-signature-v2": signature,
      Accept: "application/json",
    });

    return reply(result.statusCode, {
      ok: result.statusCode >= 200 && result.statusCode < 300,
      ncpStatus: result.statusCode,
      timestamp,
      requestUri: uri,
      data: result.data,
    });
  } catch (error) {
    return reply(502, {
      ok: false,
      message: error.message || "Billing API 호출에 실패했습니다.",
    });
  }
}
