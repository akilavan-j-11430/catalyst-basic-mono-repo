import { describe, expect, it, vi } from "vitest";
import { ContentType } from "@/enums/content-type";
import { HttpHeader } from "@/enums/http-header";
import { HttpClient } from "@/http/http-client";
import type { TransportRequest } from "@/types/http";

/** A client whose transport records what it was asked to send and answers 200. */
function recordingClient(
  headers?: () => Record<string, string>,
): { billing: HttpClient; sentRequests: TransportRequest[] } {
  const sentRequests: TransportRequest[] = [];
  const billing = new HttpClient({
    baseUrl: "https://billing.example.com/v2",
    headers,
    transport: async (request) => {
      sentRequests.push(request);
      return { status: 200, headers: {}, body: new Uint8Array() };
    },
  });
  return { billing, sentRequests };
}

describe("HttpClient request encoding", () => {
  it("sends an object as JSON", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.post("/invoices", { amount: 42 });

    expect(sentRequests[0]?.body).toBe('{"amount":42}');
    expect(sentRequests[0]?.headers[HttpHeader.ContentType]).toBe(ContentType.Json);
  });

  it("sends a string untouched as text", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.post("/notes", "paid in full");

    expect(sentRequests[0]?.body).toBe("paid in full");
    expect(sentRequests[0]?.headers[HttpHeader.ContentType]).toBe(ContentType.Text);
  });
});

describe("HttpClient declared content type", () => {
  it("rejects a declared type that contradicts the JSON encoding", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/invoices", { amount: 42 }, {
      headers: { [HttpHeader.ContentType]: ContentType.Xml },
    });

    await expect(sending).rejects.toThrow(TypeError);
    expect(sentRequests).toHaveLength(0);
  });

  it("rejects a declared multipart type on FormData", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/uploads", new FormData(), {
      headers: { [HttpHeader.ContentType]: ContentType.Multipart },
    });

    await expect(sending).rejects.toThrow(TypeError);
    expect(sentRequests).toHaveLength(0);
  });
});

describe("HttpClient execution id", () => {
  it("sends the execution id the caller's headers supply, and logs it with the call", async () => {
    const callLine = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { billing, sentRequests } = recordingClient(() => ({
      [HttpHeader.AppExecutionId]: "execution-1",
    }));

    await billing.get("/invoices/1");

    expect(sentRequests[0]?.headers[HttpHeader.AppExecutionId]).toBe("execution-1");
    expect(callLine).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /^GET https:\/\/billing\.example\.com\/v2\/invoices\/1 -> 200 in \d+ ms \(app-execution-id: execution-1\)$/,
      ),
    );
  });

  it("adds none of its own", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { billing, sentRequests } = recordingClient();

    await billing.get("/invoices/1");

    expect(sentRequests[0]?.headers).not.toHaveProperty(HttpHeader.AppExecutionId);
  });
});
