# Credits & third-party licenses

Incarna's own source code is MIT-licensed (see `LICENSE`). It stands on the
shoulders of the following projects and assets, each under its own license.

## Runtime libraries (vendored in `vendor/`)

| Library | Author | License |
|---|---|---|
| [A-Frame](https://aframe.io) 1.5 | Supermedium / A-Frame team | MIT |
| [three.js](https://threejs.org) (bundled by A-Frame) | mrdoob & contributors | MIT |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | pixiv Inc. | MIT |
| [@pixiv/three-vrm-animation](https://github.com/pixiv/three-vrm) | pixiv Inc. | MIT |

## Body animations (`assets/anims/vrma/`)

The `.vrma` clips (Angry, Blush, Clapping, Goodbye, Jump, LookAround, Relax,
Sad, Sleepy, Surprised, Thinking) are from **VRoid Project's free "VRM Animation"
sample set** by pixiv. See the VRoid sample-motion terms:
<https://vroid.pixiv.help/hc/en-us/articles/4402394424089>. If you redistribute
a fork, re-check those terms and keep this credit.

## Avatars (`assets/avatars/`) — NOT bundled

VRM avatar models are **not** included in this repository. Bring your own (see
`assets/avatars/README.md`). Always honour each model's embedded VRM license
(`avatarPermission`, `commercialUsage`, `allowRedistribution`, `creditNotation`).

> The reference avatar used during development is **「モブギャルちゃん」 by 桜タク**
> (VRM 1.0; `avatarPermission: everyone`, `commercialUsage: personalProfit`,
> **`allowRedistribution: false`**, `creditNotation: required`). Because
> redistribution is not permitted, it is intentionally excluded from this repo.
> If you use it, credit 桜タク wherever the avatar appears.

## AI services (used at runtime via your own API keys)

- **[OpenClaw](https://openclaw.ai)** — the agent "brain".
- **[ElevenLabs](https://elevenlabs.io)** — text-to-speech voices.
- **[OpenAI](https://openai.com)** — Whisper (speech-to-text) and the fast
  persona layer (`gpt-4o-mini`).

You are responsible for complying with each provider's terms of use.
