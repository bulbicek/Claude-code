# Traps, with their symptoms

Each of these cost real debugging time, and most have symptoms that point somewhere else.

## TLS fails with "RSA routines: internal error"

**Symptom** — the TLS handshake to the device dies immediately:

```
SSLHandshakeException: Read error: ... Failure in SSL library, usually a protocol error
error:04000044:RSA routines:OPENSSL_internal:internal error (native_crypto.cc:692)
```

**Cause** — a key generated in `AndroidKeyStore` may only sign in the ways declared when
it was created. Declaring PKCS#1 alone is not enough: the peer may ask for **RSA-PSS**,
the key refuses, and the handshake dies before any protocol message is exchanged. The
error mentions reading, which makes it look like a network or protocol problem.

**Fix** — generate the RSA key in the app and keep it in a `PKCS12` file in the app's
private storage. A plain `PrivateKey` signs however TLS asks. Build a `KeyManagerFactory`
from that keystore as usual.

This also buys testability, which is the better reason: `AndroidKeyStore` does not exist
on a development machine, so the keystore version cannot be tested at all, while a
software key can be exercised by a loopback TLS test that catches exactly this failure.

Generating a self-signed certificate without a crypto library means writing the DER by
hand. It is about 120 lines: a `TBSCertificate` (serial, algorithm, issuer, validity,
subject, and `publicKey.getEncoded()`, which is already a `SubjectPublicKeyInfo`), signed
with `SHA256withRSA`, wrapped with the algorithm identifier and signature. Parse the
result with `CertificateFactory` — if it parses and TLS accepts it, the encoding is right.

## A certificate valid for 25 years expires in 1951

**Symptom** — `CertificateExpiredException: NotAfter: Tue Nov 13 ... 1951`.

**Cause** — X.509 `UTCTime` has a two-digit year and covers only **1950–2049**. A date in
2050 is written as `50` and read back as 1950.

**Fix** — use `GeneralizedTime` (tag `0x18`, `yyyyMMddHHmmss'Z'`) for dates from 2050 on,
`UTCTime` (tag `0x17`) before that, which is what the standard requires anyway.

This surfaces only if a test checks that validity extends into the future. Checking
"is it valid right now" passes happily, because 1951 is in the past at both ends.

## Every key press disconnects and reconnects

**Symptom** — the device connects, announces itself, reports ready, and then each key
press produces a disconnect followed by a fresh connection. Nothing happens on screen.
The log shows `NetworkOnMainThreadException`.

**Cause** — Android forbids network I/O on the thread that draws the screen. The write
from the button handler throws, the error handler reads that as a broken connection and
closes it. Receiving usually already runs on its own thread, so the bug hides in the half
of the code that was never given one.

**Fix** — hand writes to a single-threaded executor. Guard against regression by recording
which thread performed the last write and asserting it was not the caller's; a plain
functional test passes either way, because test frameworks do not enforce the Android rule.

## Tests fail with no message on device fields

**Symptom** — a session test times out waiting for a handshake step, with no obvious cause.

**Cause** — `android.os.Build.MODEL` and friends are `null` in plain JVM unit tests, and
writing a null string into a protobuf field throws inside a background thread, where the
exception is invisible.

**Fix** — substitute a default for empty device information. Real devices can report empty
values too, so this is worth doing regardless of tests.

## A device that cannot be woken

**Symptom** — sleep works, wake never does; every attempt returns `EHOSTUNREACH`.

**Cause** — the device turns its Wi-Fi radio off in standby, so it is not on the network
at all. Distinguish this from a refused connection (device present, port closed) or a
timeout (present but unresponsive) — only the latter two leave anything to talk to.

**Fix** — none from the phone. Turning off the device's automatic sleep is the honest
answer. Say so rather than iterating on retry logic.

While investigating, replace long connection attempts with a short probe to the port.
Six ten-second attempts take a minute and bury the real message; eight two-second probes
give a clear answer quickly.
