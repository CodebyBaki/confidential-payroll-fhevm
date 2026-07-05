const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const BATCH_FILE = path.join(DATA_DIR, "payroll-batches.json");
const WEB_ROOT = path.resolve(__dirname, "..");

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xB482f89B468a9E9Ea8AFA38C09e83d0430D93De2";
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, service: "confidential-payroll-api" });
      return;
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      sendJson(res, 200, { contractAddress: CONTRACT_ADDRESS, chainId: CHAIN_ID, network: "sepolia" });
      return;
    }

    if (url.pathname === "/api/payroll-batches" && req.method === "GET") {
      sendJson(res, 200, readBatches());
      return;
    }

    if (url.pathname === "/api/payroll-batches" && req.method === "POST") {
      const body = await readJson(req);
      const batch = createBatch(body);
      const batches = readBatches();
      batches.unshift(batch);
      writeBatches(batches);
      sendJson(res, 201, batch);
      return;
    }

    const batchMatch = url.pathname.match(/^\/api\/payroll-batches\/([^/]+)$/);
    if (batchMatch && req.method === "PATCH") {
      const body = await readJson(req);
      const batches = readBatches();
      const idx = batches.findIndex((batch) => batch.id === batchMatch[1]);
      if (idx === -1) {
        sendJson(res, 404, { error: "Batch not found" });
        return;
      }
      batches[idx] = {
        ...batches[idx],
        status: body.status || batches[idx].status,
        txHash: body.txHash || batches[idx].txHash,
        rowCount: Number.isInteger(body.rowCount) ? body.rowCount : batches[idx].rowCount,
        updatedAt: new Date().toISOString(),
      };
      writeBatches(batches);
      sendJson(res, 200, batches[idx]);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ConfidentialPayroll API listening on http://${HOST}:${PORT}`);
});

function createBatch(body) {
  const rowCount = Number(body.rowCount || 0);
  if (!Number.isInteger(rowCount) || rowCount < 0) {
    throw new Error("rowCount must be a non-negative integer");
  }
  return {
    id: crypto.randomUUID(),
    fileName: String(body.fileName || "payroll-upload"),
    employer: body.employer || null,
    contractAddress: body.contractAddress || CONTRACT_ADDRESS,
    network: body.network || "sepolia",
    rowCount,
    employeeCount: Array.isArray(body.employees) ? body.employees.length : rowCount,
    status: "validated",
    txHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function serveStatic(pathname, res) {
  let relativePath = pathname;
  if (relativePath === "/") relativePath = "/employer/index.html";
  if (relativePath === "/employer" || relativePath === "/employer/") relativePath = "/employer/index.html";
  if (relativePath === "/employee" || relativePath === "/employee/") relativePath = "/employee/index.html";
  const filePath = path.resolve(WEB_ROOT, "." + relativePath);
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BATCH_FILE)) fs.writeFileSync(BATCH_FILE, "[]\n");
}

function readBatches() {
  return JSON.parse(fs.readFileSync(BATCH_FILE, "utf8"));
}

function writeBatches(batches) {
  fs.writeFileSync(BATCH_FILE, `${JSON.stringify(batches, null, 2)}\n`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
