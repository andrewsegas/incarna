# Adding Body Actions

Agents can move their bodies and show facial emotions while they talk. This is
the **action system**: a catalog of named motions the brain can trigger inline in
its speech.

## How `[action:tag]` works, end to end

1. The brain writes an action inline in its speech text, like:
   `Sure thing! [action:wave] What can I do for you?`
2. Incarna **strips** the `[action:tag]` marker out of the text so it's never
   spoken.
3. It looks up `tag` in the action catalog (`actions.json`), plays the matching
   `.vrma` body motion, and — if the entry has a `face` — shows that facial
   emotion.

Only actions whose `status` is **not** `"broken"` are advertised to the brain, so
the brain only knows about actions that actually work.

There's a special built-in action, **`[action:calm]`** (synonyms: `idle`, `stop`,
`quiet`), that returns the avatar to the calm idle pose.

## The `actions.json` shape

`actions.json` lives at the repo root:

```json
{
  "actions": [
    {
      "tag": "wave",
      "vrma": "Goodbye",
      "face": "happy",
      "desc": "A friendly wave hello or goodbye",
      "status": "ok",
      "note": "optional free-text note"
    }
  ]
}
```

Fields:

- `tag` — the name the brain uses, i.e. `[action:wave]`.
- `vrma` — which `.vrma` motion file to play (from `assets/anims/vrma/`).
- `face` — *optional* facial emotion to show. One of: `happy`, `angry`, `sad`,
  `surprised`, `relaxed`.
- `desc` — short description (helps the brain know when to use it).
- `status` — `"ok"`, `"untested"`, or `"broken"`.
- `note` — *optional* free-text note.

## Where `.vrma` files come from

`.vrma` files are VRM Animation motions. The **VRoid VRM Animation samples** are a
good source. Drop the files into `assets/anims/vrma/`.

## Adding a new action

1. **Add the motion.** Drop a new `.vrma` file into `assets/anims/vrma/`.
2. **Add a catalog entry** to `actions.json`: a `tag`, the `vrma` name, and
   optionally a `face`. Start it as `"untested"`.
3. **Test it in the Action Lab** (see below).
4. **Flip `status` to `"ok"`** once it looks right.

## The ok / untested / broken curation model

Each action carries a status so you can curate the catalog:

- `ok` — verified, works. **Offered to the brain.**
- `untested` — not checked yet. **Still offered to the brain** (only `broken` is
  hidden).
- `broken` — doesn't work. **Hidden from the brain**, so it never gets triggered.

This lets you keep a broken entry in the file (with a `note` about why) without it
leaking into conversations.

## Running the Action Lab

The **Action Lab** is a page at `/lab.html`. It loads a live avatar and lets you:

- trigger every action to see how it looks,
- mark each one `ok` / `untested` / `broken`,
- add notes,
- and **Save** (which writes back to `actions.json`).

Open it in a browser at `/lab.html` while the server is running.

**Saving requires the server to allow dev writes.** For safety this is off by
default. Start the server with the env var set to enable saving:

```sh
ALLOW_DEV_WRITES=true node server.js
```

Without `ALLOW_DEV_WRITES=true`, you can still trigger and preview actions in the
Lab — you just can't save changes to `actions.json`.
