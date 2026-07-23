# Adding an Agent

An "agent" in Incarna is one talking 3D avatar in your room: a display name, a
personality, a voice, and a VRM body that sits in a seat. This guide walks you
through adding one.

## 1. Create your config

Incarna reads `agents.local.json` (your personal config, gitignored). If it's
missing, it falls back to the shipped `agents.example.json`. Start by copying the
example:

```sh
cp agents.example.json agents.local.json
```

Now edit `agents.local.json`. The overall shape is described in
`agents.schema.json`.

## 2. Add a VRM avatar

Avatars are **not** bundled with Incarna, because VRM licenses often forbid
redistribution. You bring your own `.vrm` file, drop it into `assets/avatars/`,
and point the agent's `avatar` field at it.

See [`assets/avatars/README.md`](../assets/avatars/README.md) for where to get
avatars and how to check a file's license. You can also print a VRM's license
from the command line:

```sh
node scripts/vrm-meta.mjs assets/avatars/your-avatar.vrm
```

## 3. Get an ElevenLabs voice

The `voice` field takes an ElevenLabs `voice_id`. Grab one from your ElevenLabs
voice library (each voice has an ID you can copy). Paste that ID into the agent's
`voice` field.

## 4. Point the "brain" at an OpenClaw agent

The `brain` field is the OpenClaw agent id that actually thinks and replies. This
is the conversational agent the avatar speaks for. Set `brain` to the id of an
existing OpenClaw agent.

The separate `tone` field is a short personality description used by the fast
persona layer (the quick, in-character reactions) — keep it short and flavorful.

## 5. Assign a seat

Every agent sits in a **seat** defined under `office.seats`. A seat has:

- `position`: `[right, up, forwardOffset]` in meters, relative to you.
  - `right` — positive moves the seat to your right.
  - `up` — vertical offset.
  - `forwardOffset` — **negative moves the seat further away** from you.
- `rotation`: yaw in degrees (which way the avatar faces).

The `office` block also controls the room:

- `environment`: `"passthrough"` (see your real room in Mixed Reality) or
  `"void"` (a plain empty space).
- `spawn`: `{ "forward": <meters in front of you>, "lift": <meters> }` — where
  things appear relative to you.

To add a **new seat**, add another entry under `office.seats` and reference its
name from the agent's `seat` field.

## Complete example: one agent

```json
{
  "office": {
    "environment": "passthrough",
    "seats": {
      "desk": { "position": [0, 0, -1.2], "rotation": 180 }
    },
    "spawn": { "forward": 1.2, "lift": 0 }
  },
  "agents": [
    {
      "id": "ada",
      "name": "Ada",
      "emoji": "🧠",
      "brain": "my-openclaw-agent",
      "voice": "EXAVITQu4vr4xnSDxMaL",
      "avatar": "assets/avatars/ada.vrm",
      "seat": "desk",
      "desc": "Your research buddy",
      "tone": "warm, curious, a little nerdy"
    }
  ]
}
```

Optional per-agent fields:

- `scale`: a number to resize the avatar if it's too big or small.
- `phrases`: a folder id under `assets/voz/` for canned phrase audio.

## Adding a second agent and a new seat

Add another seat under `office.seats`, then add a second entry to `agents` that
references it:

```json
{
  "office": {
    "environment": "passthrough",
    "seats": {
      "desk":  { "position": [0, 0, -1.2], "rotation": 180 },
      "couch": { "position": [1.0, 0, -1.4], "rotation": 200 }
    },
    "spawn": { "forward": 1.2, "lift": 0 }
  },
  "agents": [
    {
      "id": "ada",
      "name": "Ada",
      "emoji": "🧠",
      "brain": "my-openclaw-agent",
      "voice": "EXAVITQu4vr4xnSDxMaL",
      "avatar": "assets/avatars/ada.vrm",
      "seat": "desk",
      "desc": "Your research buddy",
      "tone": "warm, curious, a little nerdy"
    },
    {
      "id": "rex",
      "name": "Rex",
      "emoji": "🛠️",
      "brain": "my-ops-agent",
      "voice": "TxGEqnHWrfWFTfGW9XjX",
      "avatar": "assets/avatars/rex.vrm",
      "seat": "couch",
      "desc": "Handles the ops stuff",
      "tone": "blunt, fast, dry humor"
    }
  ]
}
```

## 6. Restart the server

Config is read at startup, so restart to pick up your changes:

```sh
node server.js
```

(Default port is `8080`.)

## Talking to your agents

- With a **single agent**, it's always active — just talk.
- With **two or more agents**, you pick who you're talking to by **looking at
  them** (gaze). Turn toward an avatar to address it.
