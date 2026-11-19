---
name: tv-remote-apps
description: Building Android apps that control TVs, set-top boxes and streaming devices — over infrared (IR blaster) or over the network (Android TV Remote v2). Use this whenever the user wants to control a TV, Android TV box, Fire TV, Mi Box, or set-top box from a phone, asks about IR/NEC remote codes, an IR blaster, HDMI-CEC alternatives, pairing with an Android TV, or debugging a remote app that connects but does not respond. Also use it when a remote-control app fails with TLS handshake errors, NetworkOnMainThreadException, or a device that cannot be woken from standby — those exact traps are documented here with fixes.
---

# Remote-control apps for TVs and set-top boxes

Controlling a TV or box from a phone looks like one problem but is really two,
and picking the wrong one wastes hours. Start by identifying the transport, then
follow the matching reference.

## Step 1: identify the transport before writing anything

Look at the device's **original remote**, not the device:

| What you see on the remote | Transport | What to do |
|---|---|---|
| Microphone / assistant button, smooth front, no IR window | Bluetooth — and so the device is almost certainly network-controllable | `references/android-tv-remote.md` |
| Classic layout, numeric keypad, visible IR window at the tip | Infrared | `references/ir-nec.md` |

Two cheap checks settle it when the photo is ambiguous:

- **Camera test** — point the remote at a phone's front camera and press a button.
  A faint purple flash means IR. Nothing means Bluetooth or RF.
- **Line-of-sight test** — if the remote works with the device covered, it is not IR.

Ask the user for the device's **exact model number** (the sticker on the back or
underside). Generations differ enormously: the same brand and year may or may not
have a LAN port, a Smart TV stack, or a network control API. Do not infer the
capabilities of a model from its siblings — a 2011 LG LW5700 is a NetCast smart TV
with a documented control API, while the LW4500 from the same year has no network
at all.

## Step 2: know what the phone can and cannot do

- A phone's IR blaster **only transmits**. It has no receiver, so a phone can never
  learn codes from an existing remote. If codes are not in a public database, they
  must be captured with an IR receiver module (TSOP38238 + any microcontroller),
  or brute-forced. Say this plainly and early rather than promising a capture feature.
- A **web page cannot do either transport**. HTTPS pages cannot open `http://` or
  `ws://` connections to a device on the LAN (mixed content), and browsers have no
  IR access at all. A remote must be a native app, or a local bridge process plus a
  web UI served over plain HTTP.

## Step 3: build diagnostics in from the first version

This matters more than it sounds. Neither transport can be tested against the real
device from a development machine, so the user is the only one who can run it — and
"it doesn't work" is useless feedback. A visible log panel inside the app, showing
each protocol step as it happens, turns one screenshot into an exact diagnosis.

In practice this found three separate bugs in one evening: the TLS failure, the
threading bug, and the standby limitation — each from a single screenshot.

Log the steps a protocol actually goes through ("TLS connected", "device announced
itself as X", "device is ready"), and the reason for every disconnect. Keep failure
messages specific: `EHOSTUNREACH` means the device is not on the network at all,
which is a completely different problem from a refused connection.

## Step 4: prefer designs you can test locally

Both transports can be tested on a development machine with no device present, and
this is worth real design effort:

- **A TLS client certificate** can be exercised against a loopback `SSLServerSocket`
  with `setNeedClientAuth(true)` — exactly the condition the real device imposes.
- **A whole session protocol** can be exercised against a fake device: a small server
  that performs the same handshake. Implement the test's framing **independently** of
  the app's, so the test checks the app rather than agreeing with it.
- **Codec maths** (IR frame construction, magic packets) are pure functions; verify
  them against independently known values.

The choice between two implementations should take testability into account. In this
project, moving a key out of `AndroidKeyStore` into a self-generated file both fixed a
bug and made the whole TLS path testable — the second reason was the stronger one.

## References

- `references/ir-nec.md` — IR transmission from Android, NEC encoding, verified LG code
  table, where to find codes for other brands, what to do when a brand is not in any
  database.
- `references/android-tv-remote.md` — the full Android TV Remote v2 protocol: pairing,
  session handshake, protobuf field numbers, key codes, discovery.
- `references/pitfalls.md` — the bugs that cost the most time, with symptoms and fixes.
  Read this before debugging anything in these areas; several have misleading symptoms.
- `references/build-and-test.md` — Android build and test environment notes, including
  network restrictions that break Gradle and Robolectric in sandboxes.

## Multi-device apps

When a user has several devices, expect the app to hold several remotes. A swipeable
pager with one page per device works well, with each page owning its own transport.
Give each page a distinct dark background tint so the user knows which remote is in
front of them without reading the title — equal darkness, different hue.

Keep per-device state (host address, MAC, pairing material) in preferences keyed per
page, and make sure a page only opens its connection when it is actually shown.
