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
│  /api/agent    ─▶ OpenClaw gateway /v1/chat/completions   (the agent "brain")   │
│                   · user: "incarna:<id>"  → stable session (agent keeps history) │
│                   · staples a voice/output preamble onto the message             │
│  /api/tts      ─▶ ElevenLabs with-timestamps   (text → voice + lip-sync timing) │
│  /api/status   health · SESSION_TOKEN gate · per-IP rate limit                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## The conversation loop

You talk **directly to the selected agent** — no LLM middleman rewriting or
classifying your words. OpenAI is used only for transcription (STT).

1. **STT** — held audio → `/api/stt` (Whisper) → text.
2. **Agent** — text → `/api/agent` → the OpenClaw agent for the active avatar.
   Two things make this work well:
   - **Stable session.** The call sends `user: "incarna:<agentId>"`, so the
     Gateway keeps a persistent session and the agent remembers the whole
     conversation across turns. The app stores no history itself.
     *(The Gateway's OpenAI endpoint is stateless per request unless you pass a
     stable `user` — see `gateway/openai-http-api.md`.)*
   - **Stapled output instructions.** The server appends a short "voice mode"
     preamble (`voicePreamble()`) to the message: answer briefly, spoken style,
     and optionally end with one `[action:tag]`. This is added **only** to
     messages sent through Incarna — talking to the same agent via webchat is
     unaffected, and the agent needs no special teaching.
3. While the agent works, the avatar shows a `think` pose; if the reply is slow
   (>1.5s) a pre-generated filler phrase covers the pause.
4. The reply → **TTS** (`/api/tts`, ElevenLabs `with-timestamps`) → the alignment
   drives **viseme-based lip-sync** in `vrm-actor`.

Inline `[action:tag]` markers in the reply are stripped from the audio and turned
into a body motion / facial expression (see `docs/adding-actions.md`).

> **Why direct (not a relay)?** An earlier design routed everything through a
> "secretary" agent that forwarded to other agents and summarized back. That
> doubled latency, split history across sessions, and could ping-pong. Talking
> directly to the agent you're facing — each with its own persistent memory — is
> simpler, cheaper, and keeps full context.

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
