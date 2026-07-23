// Uso: node scripts/inspect-glb.mjs arquivo.glb
// Imprime animacoes (nome/duracao), meshes e primeiros ossos de um .glb
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12); // header 12 bytes, chunk 0 = JSON
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

const anims = (gltf.animations || []).map((a) => a.name);
const meshes = (gltf.meshes || []).map((m) => m.name);
const bones = (gltf.nodes || []).map((n) => n.name).filter(Boolean);
console.log(JSON.stringify({
  animations: anims,
  meshes,
  totalNodes: bones.length,
  primeirosNodes: bones.slice(0, 12),
}, null, 2));
