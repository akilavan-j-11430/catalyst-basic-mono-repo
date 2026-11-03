import type { Socket } from "net";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env["X_ZOHO_CATALYST_LISTEN_PORT"] || 3000;
const app = express();

const apiProxy = createProxyMiddleware({
  target: "http://localhost:8000",
  changeOrigin: true,
  pathFilter: "/api",
});

// Local only: runs a job by hand on the job-executor dev server - `POST /jobs/<jobName>`.
// Through here, the request carries the project credentials `catalyst serve` adds.
const jobsProxy = createProxyMiddleware({
  target: "http://localhost:8100",
  changeOrigin: true,
  pathFilter: "/jobs",
});

const viteProxy = createProxyMiddleware({
  target: "http://localhost:4000",
  changeOrigin: true,
  ws: true,
});

app.use(apiProxy);
app.use(jobsProxy);
app.use(viteProxy);

const server = app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api")) {
    apiProxy.upgrade(req, socket as Socket, head);
  } else {
    viteProxy.upgrade(req, socket as Socket, head);
  }
});
