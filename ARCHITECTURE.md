# Architecture

Incarna is deliberately small: a **zero-dependency Node proxy** (`server.js`) plus
a **static WebXR front-end** (A-Frame + three-vrm). No build step, no framework.

```
┌─────────────────────────── Browser / Quest (WebXR) ───────────────────────────┐
│                                                                                │
│  lobby.js ──▶ voice-chat.js (press-to-talk state machine)                      │
│                    │                                                           │
│                    ▼                                                           │
│  office-manager.js  ── spawns one avatar per agent, gaze picks the "active" one │
│        │                                                                       │
│        ▼                                                                       │
│  vrm-actor.js  ── actions (.vrma) · facial emotions · lip-sync · blink · breathe │
│  grabbable.js  ── move avatars (grip / drag)   look-at-camera.js · fit-model.js  │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                 │  fetch /api/*  (never sees your API keys)
                                 ▼
┌──────────────────────────── server.js (proxy) ─────────────────────────────────┐
│  /api/office /api/agents      config from agents.local.json                     │
│  /api/actions                 catalog from actions.json                         │
│  /api/stt      ─▶ OpenAI Whisper           (speech → text)                      │
│  /api/persona/route ─┐                                                          │
│  /api/persona/summarize ─▶ OpenAI gpt-4o-mini   (fast persona layer)            │
│  /api/agent    ─▶ OpenClaw gateway /v1/chat/completions   (the slow "brain")    │
│  /api/tts      ─▶ ElevenLabs with-timestamps   (text → voice + lip-sync timing) │
│  /api/status   health · SESSION_TOKEN gate · per-IP rate limit                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## The two-layer conversation

Latency is the enemy of presence, so a full agent turn never blocks the voice loop:

1. **STT** — held audio → `/api/stt` (Whisper) → text.
2. **Fast persona** (`gpt-4o-mini`, `/api/persona/route`) classifies the utterance:
   - **small talk / an action request** ("wave", "be happy") → answered *instantly*, no brain call.
   - **task** → returns a one-line ack; the real request goes to the brain in parallel.
3. While the **brain** (`/api/agent` → an OpenClaw agent) works, the avatar plays a
   pre-generated "thinking" phrase + a `think` pose to cover the wait.
4. The brain's result is compressed into 1–2 spoken lines by the fast persona
   (`/api/persona/summarize`).
5. Every spoken line → **TTS** (`/api/tts`, ElevenLabs `with-timestamps`) → the
   alignment drives **viseme-based lip-sync** in `vrm-actor`.

Inline `[action:tag]` markers in any spoken line are stripped from the audio and
turned into a body motion / facial expression (see `docs/adding-actions.md`).

## Why a proxy

`server.js` exists so your OpenClaw token and ElevenLabs / OpenAI keys stay on the
server and never reach the browser. It also centralizes the health check, the
optional `SESSION_TOKEN` gate, and rate limiting. See `docs/security.md`.

## Avatars are VRM-standard

Everything expressive (`vrm-actor`) is built on the VRM humanoid + expression
standard, so swapping the `.vrm` in an agent's config keeps all actions,
emotions and lip-sync working. Avatars are not bundled — see
`assets/avatars/README.md`.

## Key files

| File | Role |
|---|---|
| `server.js` | Proxy + API + config loader + security |
| `agents.local.json` | Your office + agents (falls back to `agents.example.json`) |
| `actions.json` | Curated body-action catalog |
| `js/voice-chat.js` | Press-to-talk, the visible state machine, error surfacing |
| `js/components/office-manager.js` | Spawns avatars, gaze selection, persisted layout |
| `js/components/vrm-actor.js` | Actions, emotions, lip-sync, blink, breathing |
| `js/components/grabbable.js` | Move avatars (grip / mouse) |
| `lab.html` | Action Lab — test & curate actions |
