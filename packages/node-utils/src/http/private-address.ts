import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Says whether a URL points inside a network rather than at the public internet - loopback,
 * a private range, link-local (where cloud metadata services answer) and the like. A
 * monitored URL is typed by a user and then called by our servers, so without this check a
 * monitor, or "check now", could probe the servers' own neighbours and report what answered.
 *
 * Every address the host resolves to is checked. A host that does not resolve is not
 * private - the call itself then fails as a miss. DNS can change between this check and the
 * call; this closes the plain case, not a deliberate rebinding.
 */
export class PrivateAddress {
  private static readonly RANGES = PrivateAddress.privateRanges();

  static async isPrivateUrl(url: string): Promise<boolean> {
    const host = new URL(url).hostname.replace(/^\[(.*)\]$/, "$1");
    const addresses = isIP(host) !== 0 ? [host] : await PrivateAddress.resolve(host);
    return addresses.some((address) => PrivateAddress.isPrivate(address));
  }

  private static isPrivate(address: string): boolean {
    return PrivateAddress.RANGES.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
  }

  private static async resolve(host: string): Promise<string[]> {
    try {
      const resolved = await lookup(host, { all: true, verbatim: true });
      return resolved.map(({ address }) => address);
    } catch {
      return [];
    }
  }

  private static privateRanges(): BlockList {
    const ranges = new BlockList();
    const ipv4: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    // No `::ffff:0:0/96`: BlockList already checks an IPv4-mapped IPv6 address against the
    // IPv4 ranges, and that entry would match every IPv4 address too.
    const ipv6: Array<[string, number]> = [
      ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
    ];
    ipv4.forEach(([network, prefix]) => ranges.addSubnet(network, prefix, "ipv4"));
    ipv6.forEach(([network, prefix]) => ranges.addSubnet(network, prefix, "ipv6"));
    return ranges;
  }
}
