# Android TV Remote v2

The protocol the official Google TV phone app speaks. Every Android TV device runs it,
which makes it the right choice for any Android TV box, regardless of whether its
original remote is Bluetooth or IR. It carries every key, app launching and volume, and
needs no line of sight.

Reference implementation worth consulting when something is unclear:
`https://github.com/tronikos/androidtvremote2` (Python). Its `.proto` files are the
authoritative field numbering.

## Shape of the protocol

- **Port 6467** — pairing. Run once; the device remembers the client by its certificate.
- **Port 6466** — the control session.
- Both are **TLS with a client certificate**. The device's certificate is self-signed, so
  accept any server certificate; authenticity is established by the pairing code instead.
- Messages are protobuf, each preceded by a **varint length**. Only a handful of message
  types are used, so hand-writing a minimal encoder/decoder is reasonable and avoids a
  protobuf dependency.
- Discovery: mDNS service type `_androidtvremote2._tcp.` — `NsdManager` finds the device
  and resolves its address, so users never need to hunt for an IP.

## Pairing (port 6467)

Every message is an `OuterMessage`: field 1 = protocol version (2), field 2 = status
(200 = OK). Anything other than 200 means the device refused.

| Direction | Field | Contents |
|---|---|---|
| → | 10 `pairing_request` | 1 = service name `"atvremote"`, 2 = client name shown on screen |
| ← | 11 `pairing_request_ack` | |
| → | 20 `options` | 1 = encoding { 1 = type 3 (hexadecimal), 2 = symbol length 6 }, 3 = role 1 (input) |
| ← | 20 `options` | |
| → | 30 `configuration` | 1 = same encoding, 2 = client role 1 |
| ← | 31 `configuration_ack` | device now shows a six-character code |
| → | 40 `secret` | 1 = the digest below |
| ← | 41 `secret_ack` | paired |

The code is hexadecimal. Its first byte is a checksum of the rest:

```
digest = SHA256( clientModulus ‖ clientExponent ‖ serverModulus ‖ serverExponent ‖ bytes(code[2:]) )
valid  = digest[0] == int(code[0:2], 16)
```

Moduli and exponents are big-endian with **no leading zero byte** — Java's
`BigInteger.toByteArray()` adds one when the high bit is set, so strip it.

Validate the code locally before sending it. A mistyped code then costs the user one
retry instead of restarting the whole pairing, because a wrong secret makes the device
close the connection.

## Session (port 6466)

`RemoteMessage` fields:

| Field | Message | Who | Notes |
|---|---|---|---|
| 1 | `remote_configure` | both | device announces itself, client replies in kind |
| 2 | `remote_set_active` | both | client echoes its feature flags |
| 3 | `remote_error` | device | |
| 8 / 9 | `ping_request` / `ping_response` | device / client | **must** be answered or the device closes the connection |
| 10 | `remote_key_inject` | client | 1 = key code, 2 = direction (3 = short press) |
| 40 | `remote_start` | device | the session is ready from here on |
| 90 | `remote_app_link_launch_request` | client | 1 = an app link such as `https://www.netflix.com` |

The client's `remote_configure` reply carries `device_info` (field 2): 1 = model,
2 = vendor, 3 = 1, 4 = `"1"`, 5 = package name, 6 = app version.

Feature flags: ping 1, key 2, IME 4, voice 8, power 32, volume 64, app link 512. A client
that handles keys, power, volume and app launching sends **611**.

Key codes are plain Android `KeyEvent` values:

| Key | Code | Key | Code |
|---|---|---|---|
| Home | 3 | Volume + / − | 24 / 25 |
| Back | 4 | Mute | 164 |
| D-pad up / down | 19 / 20 | Play–pause | 85 |
| D-pad left / right | 21 / 22 | Next / Previous | 87 / 88 |
| D-pad centre (OK) | 23 | Rewind / Forward | 89 / 90 |
| Power | 26 | Info | 165 |
| Menu | 82 | Guide | 172 |
| Search | 84 | Settings | 176 |
| Assistant | 219 | Sleep / Wake | 223 / 224 |

## Power, and why waking usually fails

`KEYCODE_POWER` (26) is a **toggle** and many boxes ignore it. Offer the discrete
`KEYCODE_SLEEP` (223) and `KEYCODE_WAKEUP` (224) alongside it, and log which code was
sent so the user can report which one their device obeys.

Sleeping works. **Waking over the network usually does not**, and it is worth telling the
user before building anything: many Android TV boxes switch the Wi-Fi radio off entirely
in standby. The tell is `EHOSTUNREACH` / "No route to host" on every connection attempt —
the router has no route to the device at all, as opposed to a refused or timed-out
connection, which would mean the device is present but not listening.

Wake-on-LAN cannot help in that state, because nothing is listening for the magic packet.
It is still worth implementing — it costs little and works on devices that keep the radio
alive or are wired — but do not promise it. Two further traps: the MAC a device reports
may be a **randomised** one (the second-least-significant bit of the first byte is set),
and the magic packet must be broadcast, since a sleeping device has no address.

The reliable fix is on the device: turn off automatic sleep so it never leaves the
network. On Android TV this is near the screen-saver settings, but its exact location
moves between versions — ask the user what their menu actually shows rather than
asserting a path.

## Practical notes

- Do the write on a **background thread**. See `pitfalls.md`; this one is easy to get
  wrong and its symptom is misleading.
- If a key is pressed while the connection is down, hold it briefly and send it once the
  session is ready. Otherwise the first press after any drop is silently lost and users
  conclude the app is unreliable.
- Keep the client key and certificate across restarts; the device recognises the client by
  that certificate, and regenerating it silently invalidates the pairing.
