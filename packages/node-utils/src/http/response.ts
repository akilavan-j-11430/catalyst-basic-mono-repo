import type { HttpMethod } from "@/enums/http_method";
import { HttpRequestError } from "@/errors/http_request_error";
import type { HttpResponse, TransportResponse } from "@/types/http";

export function toHttpResponse(
  method: HttpMethod,
  url: string,
  transported: TransportResponse,
): HttpResponse {
  const { status, headers } = transported;
  const bytes = transported.body;
  return {
    status,
    headers,
    body: {
      raw: async () => bytes,
      text: async () => new TextDecoder().decode(bytes),
      json: async () => {
        const text = new TextDecoder().decode(bytes);
        if (text.length === 0) {
          return undefined;
        }
        try {
          return JSON.parse(text);
        } catch {
          throw HttpRequestError.Undecodable({
            method,
            url,
            status,
            headers,
            body: text,
          });
        }
      },
    },
  };
}
