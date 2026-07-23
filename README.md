<div align="center">

# ◐ Incarna

**Give your AI agents a body. Meet them in your room.**

Incarna turns your [OpenClaw](https://openclaw.ai) agents into **talking 3D avatars
in Mixed Reality** — standing in your actual room (passthrough), answering by voice,
looking at you, reacting with their face and hands. Open a link on a **Meta Quest 3**
(or any WebXR browser) and they're *there*.

No app install. Just a link.

</div>

---

> ⚠️ **Bring your own avatar.** VRM models usually can't be redistributed, so none
> ship with this repo. Drop any `.vrm` into `assets/avatars/` and point an agent at
> it — takes a minute. See [`assets/avatars/README.md`](assets/avatars/README.md).

## ✨ What it does

- 🏠 **Lives in your room.** Passthrough MR: the avatar stands on your floor and
  stays put while you look around. Turn away, look back — she's still there.
- 🎙️ **Press-to-talk voice.** Hold the mic (or a Quest controller trigger), speak,
  release. Robust by design: you always see the state and hear if something failed.
- 🧠 **Real agents.** The "brain" is any OpenClaw agent — with its tools, memory and
  data. A fast persona layer keeps the conversation snappy while the brain works.
- 🗣️ **Voice + lip-sync.** ElevenLabs voices, per agent, with viseme lip-sync,
  blinking, breathing and facial emotions.
- 🙆 **A body that reacts.** The agent can `[action:wave]`, `[action:clap]`,
  `[action:think]`, look sad/happy/surprised… curated and testable in an **Action Lab**.
- 👥 **A whole office.** Put several agents in the room. **Look at one** to talk to it —
  a ring + name shows who's listening. **Grab and move** avatars where you want them.
- 🔒 **Simple, but lockable.** It stays a link. Add a token to keep a public tunnel private.

## 🚀 Quickstart

Requirements: **Node 18+**. That's it (zero dependencies).

```bash
git clone https://github.com/andrewsegas/incarna
cd incarna

cp .env.example .env                 # add your OpenClaw / ElevenLabs / OpenAI keys
cp agents.example.json agents.local.json   # define your agents

# add a VRM avatar (see assets/avatars/README.md) and point an agent at it
node server.js                       # http://localhost:8080
```

Open **http://localhost:8080**, hit **Enter**, hold the mic and talk. Without keys it
still boots in a degraded mode (browser voice, canned replies) so you can see the scene.

## 🥽 On a Meta Quest 3

WebXR needs HTTPS. Expose the local server with any tunnel and open the URL in the
Quest browser:

```bash
node server.js
# then, in another terminal, start an HTTPS tunnel to :8080 (cloudflared, ngrok, tailscale funnel…)
```

Tap **Enter → 🥽 AR**, grant the mic, and hold a controller **trigger** (or **A/X**) to
talk. Squeeze **grip** near an avatar to move it.

## ⚙️ Configure your agents

Everything about who's in the room lives in one file — `agents.local.json`:

```json
{
  "office": {
    "environment": "passthrough",
    "seats": { "center": { "position": [0, 0, 0], "rotation": 0 } },
    "spawn": { "forward": 1.6, "lift": 0 }
  },
  "agents": [
    {
      "id": "assistant",
      "name": "Assistant",
      "emoji": "🤖",
      "brain": "main",
      "voice": "21m00Tcm4TlvDq8ikWAM",
      "avatar": "assets/avatars/my-avatar.vrm",
      "seat": "center",
      "tone": "helpful, warm, concise"
    }
  ]
}
```

- `brain` → an **OpenClaw agent id** (its tools/memory power the answers).
- `voice` → an **ElevenLabs voice_id**.
- `avatar` → your `.vrm` path.
- `seat` → a spot from `office.seats`.

Full guide: [`docs/adding-an-agent.md`](docs/adding-an-agent.md).

## 🙆 Actions & the Action Lab

The brain expresses itself with inline `[action:tag]` markers (stripped from speech,
played by the body). The catalog lives in [`actions.json`](actions.json). Open
**`/lab.html`** to trigger every action on a live avatar, mark what works, and
re-curate — only non-broken actions are offered to the brain. Adding a new gesture is
just dropping a `.vrma` file in and adding one line. See
[`docs/adding-actions.md`](docs/adding-actions.md).

## 🔒 Security

`server.js` is a proxy: your API keys never reach the browser. To lock a public
link, set `SESSION_TOKEN` and share `https://host/?k=YOUR_SECRET`. There's a per-IP
rate limiter on the expensive endpoints. Read [`docs/security.md`](docs/security.md)
before exposing a tunnel to the internet.

## 🗺️ Roadmap

- [ ] Streaming TTS (start speaking before the full reply lands).
- [ ] Richer idle life: talking gestures, weight shifts, glances.
- [ ] Environments (a rendered 3D office as an alternative to passthrough).
- [ ] Hand-tracking selection (no controllers).
- [ ] More curated actions + a community action pack.

## 🧱 Stack

A-Frame · [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) · a zero-dependency
Node proxy · [OpenClaw](https://openclaw.ai) (brain) · [ElevenLabs](https://elevenlabs.io)
(voice) · [OpenAI](https://openai.com) (STT + fast persona). See
[ARCHITECTURE.md](ARCHITECTURE.md) and [CREDITS.md](CREDITS.md).

## 🤝 Contributing

Ideas, actions, avatars-examples, polish and translations welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## 📄 License

Source code: [MIT](LICENSE). Third-party assets and the avatars you supply carry
their own licenses — see [CREDITS.md](CREDITS.md).
