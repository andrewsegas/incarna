# Contributing to Incarna

Thanks for your interest in contributing to **Incarna**! Incarna puts conversational AI agents (from [OpenClaw](https://github.com/andrewsegas)) into your room as talking 3D avatars in Mixed Reality (WebXR / Meta Quest 3), driven by voice.

This project is MIT-licensed, and we welcome contributions of all kinds: code, actions, agent examples, docs, translations, accessibility improvements, and bug reports. Please be kind and constructive — see our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Running locally

Incarna is a zero-dependency Node server plus a static front-end. No build step required.

Requirements: **Node 18+** and a modern browser (desktop Chrome works great for development; a Meta Quest 3 for the full MR experience).

```bash
# 1. Clone your fork
git clone https://github.com/<you>/incarna.git
cd incarna

# 2. Set up your environment
cp .env.example .env
cp agents.example.json agents.local.json
# edit .env and agents.local.json to add your API keys / agent config

# 3. Add at least one avatar
# Drop a .vrm file into assets/avatars/ (see assets/avatars/README.md for details)

# 4. Run the server
node server.js

# 5. Open the app
# http://localhost:8080
```

`agents.local.json` and your `.vrm` avatars are **gitignored** — never commit them.

## Project layout

Here's a quick map of where things live:

- **`server.js`** — the zero-dependency Node server. Acts as a proxy/API: serves the static front-end, proxies agent access, and keeps API keys server-side.
- **`js/components/*.js`** — A-Frame components:
  - `vrm-model` — loads and manages the VRM avatar mesh.
  - `vrm-actor` — expressions, lip-sync, and playing actions on an avatar.
  - `office-manager` — spawns avatars into the scene and handles gaze selection.
  - `grabbable` — lets you grab and move avatars around the room.
  - `look-at-camera` — makes avatars face the viewer.
  - `fit-model` — scales/positions a model sensibly.
- **`js/voice-chat.js`** — the press-to-talk voice state machine.
- **`js/lobby.js`** — the lobby / entry UI.
- **`lab.html`** — the **Action Lab**, for previewing and curating actions.
- **`actions.json`** — the action catalog.
- **`docs/`** — additional documentation.

## Good first contributions

Looking for a place to start? Any of these are very welcome:

- **New actions** — VRM-compatible `.vrma` animations, plus curation in the Action Lab (`lab.html`).
- **New agent examples** — sample entries for `agents.example.json`.
- **UI/UX polish** — HUD, lobby, and in-scene interactions.
- **Accessibility** — keyboard support, contrast, captions, comfort options.
- **Translations** — localize the interface.
- **Better lip-sync** — improve the mapping from audio to visemes.
- **Environments** — new rooms, skyboxes, and scene setups.

## Style & conventions

- **Vanilla JS.** No build step, no TypeScript, no bundler.
- **Keep the server zero-dependency.** `server.js` should run with a bare `node server.js` and no `npm install`.
- **2-space indentation.**
- **Keep it working headless.** The app should still boot and render without a headset. You can smoke-test rendering with the headless Chrome trick:

  ```bash
  chrome --headless=new --use-gl=angle --use-angle=swiftshader http://localhost:8080
  ```

- **Don't commit secrets or avatar `.vrm` files.** Keep API keys in `.env` / `agents.local.json` (both gitignored).

## Pull request process

1. **Fork** the repo and create a **branch** for your change.
2. Keep your **PR focused** — one logical change per PR is much easier to review.
3. In the PR description, explain **what you changed and how you tested it**.
4. Run `node --check` on any JS files you touched, and make sure the app still boots.
5. **Be kind** in reviews and discussion — see the [Code of Conduct](./CODE_OF_CONDUCT.md).

Thanks for helping make Incarna better!
