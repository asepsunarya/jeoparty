#!/usr/bin/env node
/**
 * Prints the LAN URLs where other devices can reach the dev servers.
 * Invoked from the root `dev` script before handing off to concurrently.
 */
const { networkInterfaces } = require("os");

const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 4000;

function lanIPs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

const ips = lanIPs();
const bar = "─".repeat(60);
const gold = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log();
console.log(gold("🎉 JEOPARTY DEV"));
console.log(bar);
console.log(`  Local:          http://localhost:${FRONTEND_PORT}`);
if (ips.length === 0) {
  console.log(dim("  (no LAN interface detected — only localhost will work)"));
} else {
  for (const ip of ips) {
    console.log(`  On your network: http://${ip}:${FRONTEND_PORT}`);
  }
  console.log();
  console.log(dim("  Share one of the network URLs with friends on the same Wi-Fi."));
  console.log(dim(`  Backend:        http://${ips[0]}:${BACKEND_PORT}`));
}
console.log(bar);
console.log();
