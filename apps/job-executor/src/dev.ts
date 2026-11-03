import express, { type Request, type Response } from "express";
import { dispatch } from "@/dispatch";
import type { JobContext, JobRequest } from "@/types";

/**
 * Local only - never bundled. Runs a job over HTTP: `POST /jobs/<jobName>` with the job's
 * params as a JSON body. Call it through the URL `catalyst serve` prints, not this port, so
 * the request picks up the project's credentials on the way through the proxy.
 */
const PORT = 8100;

function toJobRequest(jobName: string, body: Record<string, unknown>): JobRequest {
  const params: Record<string, string> = { jobName };
  for (const [key, value] of Object.entries(body)) {
    params[key] = String(value);
  }
  return { getAllJobParams: () => params };
}

function toJobContext(req: Request, res: Response): JobContext {
  const close = (status: number, outcome: string): void => {
    if (!res.headersSent) {
      res.status(status).json({ status: outcome });
    }
  };
  return {
    catalystHeaders: req.headers as Record<string, string>,
    closeWithSuccess: () => close(200, "SUCCESS"),
    closeWithFailure: () => close(500, "FAILURE"),
  };
}

const app = express();
app.use(express.json());

app.post("/jobs/:jobName", async (req, res) => {
  const body: Record<string, unknown> = typeof req.body === "object" && req.body !== null ? req.body : {};
  await dispatch(toJobRequest(String(req.params.jobName), body), toJobContext(req, res));
});

app.listen(PORT, () => {
  console.log(`[jobs] http://localhost:${PORT}`);
});
