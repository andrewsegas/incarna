#!/usr/bin/env node
// Print the embedded VRM license metadata of a .vrm file.
// Usage: node scripts/vrm-meta.mjs assets/avatars/my-avatar.vrm
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/vrm-meta.mjs <file.vrm>'); process.exit(1); }

const b = fs.readFileSync(file);
let o = 12; // skip GLB header (magic + version + length)
const jsonLen = b.readUInt32LE(o); o += 8; // len + type
const json = JSON.parse(b.toString('utf8', o, o + jsonLen));
const ext = json.extensions || {};
const meta = (ext.VRMC_vrm && ext.VRMC_vrm.meta) || (ext.VRM && ext.VRM.meta);

if (!meta) { console.log('No VRM meta found. Extensions:', Object.keys(ext)); process.exit(0); }

console.log('VRM spec:', ext.VRMC_vrm ? '1.0' : '0.x');
for (const [k, v] of Object.entries(meta)) {
  if (typeof v !== 'object') console.log(`${k}: ${JSON.stringify(v)}`);
}
console.log('\nKey rights to honour: avatarPermission, commercialUsage, allowRedistribution, creditNotation.');
