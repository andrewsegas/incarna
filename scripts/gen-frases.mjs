#!/usr/bin/env node
/**
 * gen-frases.mjs — pre-gera as frases fixas de uma persona com ElevenLabs v3.
 *
 * Por que v3 e nao Flash aqui: essas frases sao FIXAS (saudacao, ack, despedida...),
 * entao vale usar o modelo mais expressivo. Como o audio fica CACHEADO, a latencia
 * alta do v3 nao importa: gera uma vez, toca instantaneo pra sempre.
 *
 * Cada frase vira 2 arquivos em assets/voz/<persona>/:
 *   <id>.mp3   -> audio
 *   <id>.json  -> { text, alignment } p/ lip-sync (mesmo formato do /api/tts)
 * E um indice assets/voz/<persona>/index.json com { id -> {text} }.
 *
 * Uso:
 *   node scripts/gen-frases.mjs                      # usa voz/frases.secretaria.json
 *   node scripts/gen-frases.mjs voz/frases.X.json    # outro manifesto
 *   node scripts/gen-frases.mjs --only saudacao,ja-volto   # regenera so essas
 *   node scripts/gen-frases.mjs --force              # regenera mesmo se ja existir
 *
 * Le a ELEVENLABS_API_KEY do .env do projeto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- .env (mesmo parser do server.js) ----
const ENV = {};
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !l.trim().startsWith('#')) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sem .env */ }

const KEY = ENV.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Falta ELEVENLABS_API_KEY no .env'); process.exit(1); }

// ---- args ----
const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null;
const manifestArg = args.find((a) => a.endsWith('.json') && !a.startsWith('--'));
const manifestPath = path.resolve(ROOT, manifestArg || 'voz/frases.secretaria.json');

const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const persona = man.persona || 'persona';
const voice = man.voice;
const model = man.model || 'eleven_v3';
const outFmt = man.output_format || 'mp3_44100_128';
const voiceSettings = man.voice_settings || undefined;
const frases = man.frases || {};

const outDir = path.join(ROOT, 'assets', 'voz', persona);
fs.mkdirSync(outDir, { recursive: true });

async function gerarUma(id, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=${encodeURIComponent(outFmt)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, ...(voiceSettings ? { voice_settings: voiceSettings } : {}) }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const audio = Buffer.from(d.audio_base64, 'base64');
  const alignment = d.alignment || d.normalized_alignment || null;
  fs.writeFileSync(path.join(outDir, `${id}.mp3`), audio);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ text, alignment }));
  return audio.length;
}

const ids = Object.keys(frases).filter((id) => !only || only.includes(id));
console.log(`Persona: ${persona} | voz: ${voice} | modelo: ${model}`);
console.log(`Gerando ${ids.length} frase(s) em ${path.relative(ROOT, outDir)}/\n`);

const indice = {};
let ok = 0;
for (const id of Object.keys(frases)) {
  indice[id] = { text: frases[id] };
  if (!ids.includes(id)) continue;
  const mp3 = path.join(outDir, `${id}.mp3`);
  if (!force && fs.existsSync(mp3)) { console.log(`  = ${id} (ja existe, use --force p/ regenerar)`); ok++; continue; }
  try {
    const bytes = await gerarUma(id, frases[id]);
    console.log(`  ✓ ${id}  (${(bytes / 1024).toFixed(0)} KB)  "${frases[id].replace(/\[[^\]]*\]/g, '').trim().slice(0, 40)}..."`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${id}  ERRO: ${e.message}`);
  }
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(indice, null, 2));
console.log(`\nPronto: ${ok}/${ids.length} ok. Indice: ${path.relative(ROOT, path.join(outDir, 'index.json'))}`);
