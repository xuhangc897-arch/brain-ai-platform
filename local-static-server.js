"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.STATIC_PORT || process.env.PORT || 8080);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function send(response, statusCode, body, headers) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function resolveRequestPath(requestUrl) {
  let pathname;

  try {
    const url = new URL(requestUrl, `http://localhost:${PORT}`);
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    return null;
  }

  const normalizedPath = pathname === "/" ? "/login.html" : pathname;
  const filePath = path.resolve(ROOT, `.${normalizedPath}`);
  const relativePath = path.relative(ROOT, filePath);

  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return filePath;
}

function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Method not allowed", {
      "Content-Type": "text/plain; charset=utf-8"
    });
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    send(response, 403, "Forbidden", {
      "Content-Type": "text/plain; charset=utf-8"
    });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      send(response, 404, "Not found", {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response);
  });
}

http.createServer(handleRequest).listen(PORT, () => {
  console.info(`Local static server: http://localhost:${PORT}/login.html`);
});
