import { describe, expect, it } from "vitest";
import { PrivateAddress } from "@/http/private-address";

describe("PrivateAddress.isPrivateUrl", () => {
  it.each([
    "http://127.0.0.1:8000/health",
    "http://localhost/",
    "http://10.1.2.3/",
    "http://172.20.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("is private for %s", async (url) => {
    expect(await PrivateAddress.isPrivateUrl(url)).toBe(true);
  });

  it.each(["https://1.1.1.1/", "http://8.8.8.8/", "https://[2606:4700:4700::1111]/"])(
    "is public for %s",
    async (url) => {
      expect(await PrivateAddress.isPrivateUrl(url)).toBe(false);
    },
  );

  it("is not private for a host that does not resolve - the call fails as a miss instead", async () => {
    expect(await PrivateAddress.isPrivateUrl("https://no-such-host.invalid/")).toBe(false);
  });
});
