/**
 * Node.js compatibility fixes for local development.
 * Import this module before any database connections.
 *
 * Node v24+ enables autoSelectFamily by default, which tries IPv4 and IPv6
 * simultaneously. If IPv6 is unreachable (common on many networks), this
 * breaks the IPv4 connection attempt too, causing ETIMEDOUT errors to Neon.
 */
export {};

if (typeof WebSocket === 'undefined') {
  const net = await import('net');
  if (net.setDefaultAutoSelectFamily) {
    net.setDefaultAutoSelectFamily(false);
  }
}
