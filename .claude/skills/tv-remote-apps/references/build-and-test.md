# Building and testing in a sandbox

## Toolchain

Android SDK command-line tools install cleanly from `dl.google.com`; with a JDK and
Gradle present, that is all a debug APK needs:

```bash
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
gradle assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
```

A debug APK is signed with the debug key and installs after allowing unknown sources —
fine for delivering to a user. Verify what was built rather than assuming:

```bash
aapt2 dump badging app-debug.apk | grep -E "package|sdkVersion|uses-permission|application-label"
apksigner verify --print-certs app-debug.apk
```

An app with no dependencies builds to ~20 kB; one androidx dependency takes it to ~1.7 MB.
Keep remote UIs dependency-free where practical — platform widgets built in code are
compact and avoid the whole resource-merging layer.

## Network restrictions that break builds

- **Maven Central returns 429** under load. This looks like a build failure but is not:
  the message names the artifact and `Too Many Requests`. Retry a few times with pauses
  before investigating anything else.
- **Large jars redirect to `gcp.mirrors.maven.org`**, which may be blocked (403 at the
  proxy) while `repo1.maven.org` itself works for small files. The same artifacts are
  served by `https://maven-central.storage-download.googleapis.com/maven2/...`; fetch by
  hand into `~/.m2/repository/<group path>/` and add `mavenLocal()` temporarily.
- **`codeload.github.com` may be blocked** while `git clone` over HTTPS works.

Keep sandbox-only build changes out of commits. Copy the build files aside, apply the
local workaround, run, then restore — a `mavenLocal()` line or a hard-coded path in a
committed build file will break every other machine.

## Robolectric

Needed to instantiate activities. Two requirements that produce confusing errors:

- `android.useAndroidX=true`, even in an app that uses no androidx code — Robolectric's
  own dependencies are androidx, and the build fails during dependency resolution.
- It downloads an `android-all-instrumented` jar at **test runtime**, which fails in a
  restricted network. Pre-fetch it and run offline:

```groovy
tasks.withType(Test).configureEach {
    systemProperty 'robolectric.offline', 'true'
    systemProperty 'robolectric.dependency.dir', '/path/to/jars'
}
```

The error names the exact file it wants, including the variant suffix, so fetch it, run
again, and fetch whatever it asks for next. The target SDK's jar is needed even when
tests are annotated for an older one.

## What to test when the device is absent

- **Activity and page creation** under Robolectric — catches null fields, bad layout code
  and missing resources, which are otherwise found by the user on first launch.
- **Protocol maths** against independently known values: IR frames against published hex
  codes, magic packets against their documented shape.
- **A loopback TLS server with `setNeedClientAuth(true)`** — reproduces the device's
  demand for a client certificate, and would have caught the `AndroidKeyStore` signing
  failure before shipping.
- **A fake device**: a server that performs the real handshake, answers a ping and expects
  a key press. Implement its framing independently of the app's, otherwise the test agrees
  with the app's bugs. This also pins down threading, since the test can assert which
  thread performed the write.
