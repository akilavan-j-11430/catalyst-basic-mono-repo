import type { Socket } from "net";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env["X_ZOHO_CATALYST_LISTEN_PORT"] || 3000;
const app = express();

const webProxy = createProxyMiddleware({
  target: "http://localhost:4000",
  changeOrigin: true,
  ws: true,
});

app.use(webProxy);

const server = app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  webProxy.upgrade(req, socket as Socket, head);
});
