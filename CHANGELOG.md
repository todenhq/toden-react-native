# Changelog

## 4.0.0

The first release as `@toden/react-native`. The version moves to 4.0.0 to match `@toden/react` and because everyone upgrading changes their install and imports.

**Native code changed: rebuild the app (`pod install` on iOS).**

**Deploy note for Toden:** ship the matching server release first. Business documents sent one per group, address book reuse, `sessionId` on `/contact/send` and the cut-off document answer on the capture check need it. `sandbox-api.toden.co` and `api.toden.co` must be serving (both answer today).

### Upgrading from `@myazahq/kyc-sdk-react-native`

- Remove `@myazahq/kyc-sdk-react-native`, install `@toden/react-native`, and change your imports. The API is unchanged and the names from before 3.6.0 still work. The old package receives no further releases.
- Rename `myazaKycBundledMlKit` to `todenBundledMlKit` in your root `build.gradle` when convenient; the old name still works.

### Document capture

- A redesigned full-screen camera: one top row (back, the document, the side), an instruction pill that shows its state, and Upload, the shutter and Light along the bottom.
- "Take a photo" opens the SDK's own camera instead of the system one, for supporting and business documents, proof of address and the entrance photo: no scanning, the shutter always enabled.
- The cropper: an upright box for a NIN slip, Rotate with a smooth quarter turn, and a clearer full-screen editor. Its button reads "Use photo".
- A document that runs off the photo asks for a retake, beside the face and barcode checks.
- Android: a slip whose edge runs off the screen is no longer captured from a box printed on it, and camera frames always follow the screen, so corners are judged where they are shown.
- Driver's licences, the Ghana Card and Côte d'Ivoire documents are recognised from their text (LICENCE, ECOWAS, accented words).
- iPhone photos no longer fail as too large: camera and library photos are shrunk before the size check (supporting documents, proof of address, entrance photo).

### Liveness

- A still, front-facing selfie is taken in about a second: the head pose is judged from how the person holds the phone, and only a steady face counts.
- The instruction pill eases between prompts without wrapping.

### Screens

- The ID step and the country sheet match the web: bigger ID cards, the country rows, search and tags, and the selector's height and fonts. The business country of registration reads "Registered in".
- Alerts have a new design, sheets stop below the status bar, and on Android a sheet's list scrolls again.

### Toden name for the bundled ML Kit flag

- Bundle the ML Kit models with `ext { todenBundledMlKit = true }` in your root `build.gradle`. The old name, `myazaKycBundledMlKit`, still works when the new one is not set.

### API hosts

- Each environment now has its own host, as the docs list them: `pk_test_` keys go to `https://sandbox-api.toden.co` and `pk_live_` keys to `https://api.toden.co`. Both used to go to `https://trust.myaza.app`.

### Presence token and OTP settings from the session

- Presence: the `presenceToken` from `POST /verify` is stored beside the on-device pin and sent on every report, so reports from the phone that captured the address keep their full weight. Pins saved before this have no token and report at the foreground tier until the person verifies again.
- The contact step sends `sessionId` on `/contact/send` and sizes the code field from the `codeLength` the server returns.

No native code changed.

### Uploaded document row

- On a narrow phone the file size no longer runs under the Replace and Remove buttons. It moves to its own line.

### Document upload without the file picker

- In an app built without `expo-document-picker`, the document steps no longer offer "Choose a file" and then show an error. The sheet offers the photo library and camera, and the line under the upload area no longer mentions PDFs. Install the package to accept PDFs.

### Document review and audio

- `documentReview` (default off): `true` shows the review screen after a document scan. Uploaded photos always get the review, and so does a scan that failed to upload or that the capture check could not read.
- `livenessAudio` (default off): records sound on the liveness recording, and the consent screen says so. It needs the same microphone setup as `documentAudio`.
- `documentAudio` (default off): records sound on the document capture video, and the consent screen says so. Add `microphone: true` to the config plugin and rebuild. Without it, or if the person refuses, the clip records without sound. The SDK checks first, because iOS closes an app that asks for the microphone without declaring it, and a native build older than this release reads as undeclared.

### Liveness lighting judged on the face

- The liveness step no longer tells a well-lit person to move to a brighter area because the room behind them is dark. With a face in view, the light check reads the centre of the frame where the face is held, instead of the whole frame. With no face in view it still judges the whole frame. No native change.

### The Toden address book

- When the organisation has it on, the address flow opens with a choice: use an address the person saved with Toden (an email, a six-digit code, then a pick) or enter one. A picked address skips the map, the entrance photo and the review, and is sent as `addressBookReuse` instead of a pin.
- A flow with a presence check lists only saved addresses whose presence was confirmed in the last six months, and says why others are missing.
- If the server refuses the picked address (the code expired or the address can no longer be used), the flow returns to the address book step instead of ending on an error.
- The review step offers an unticked box to save the confirmed address to the person's own Toden address book, with the directions and the entrance photo each included only if they choose.
- Never offered on business verifications.

### Business documents, one group at a time

- The business documents step groups what the organisation asks for (legal presence, company details, ownership structure, authority to represent the business, address, financial, tax, licences and permits). The applicant uploads one document per group, one group at a time, instead of facing a slot for every document.
- The applicant never says which document they uploaded: the group lists the documents it accepts, and the server recognises which one it is from its text. Uploads are sent as `{ group, mediaId }`. An upload restored from an earlier session that named its document is still sent by its type.
- Each accepted document shows how recent it must be ("From the last 3 months") when the workflow sets a validity window. The date is checked after submission.
- A new screen: the groups are a vertical carousel. The open group's card is in front, the next group's card is tucked behind it at the top (showing its title and what it will ask for) and the previous group's card behind it at the bottom (its file, or Skipped, with Change to reopen it); a thin edge beyond each shows there are more groups that way. Continue brings the next card down into the middle; Back brings the previous one up. Reduced motion keeps only the fade, and a screen reader hears the position and title of the group that opens.
- The open card shows its position ("2 of 5"), the documents the group accepts with how recent each must be on its own line, and a tall upload area that is itself the control: tap it to choose a photo, take one or pick a file (there is no separate Choose a file or Take a photo button, so Continue is the only primary button). Once uploaded, a card shows the file with Replace and Remove. A new upload replaces the group's earlier one.
- The button reads Next on every group but the last and Continue on the last; an optional group with nothing uploaded reads Skip.
- A finished group keeps its number, with a small tick on it, so the count stays visible. A file name that is a random id (as phone cameras often give) shows as Uploaded instead.
- An optional group can be skipped: the button reads Skip while it holds nothing. Back steps through the groups before leaving the step.
- Every document type has a readable label, and a refusal for missing documents names the groups (`missingGroups`) or documents instead of passing through raw keys.
- Needs the matching server release, which accepts one document per group.

### Scoped business workflows

- A business workflow with the address, questionnaire or contact scope now runs that scope's own steps. It never opens the business application (company search, registry lookup, key people, documents or the applicant's own check).
- Those screens name the business: the welcome screen and its list of steps, the email and phone code steps, proof of address, the address screens, the questionnaire and the success screen. A workflow's own wording for the person's version of a text still applies to the business version. Presence checks for a business count days at the premises only.
- A business workflow with a face check scope shows "Unable to start verification" and never opens the camera. `onError` receives `invalid_workflow`.
- A submission the server refuses with `entity_type_mismatch` (the reference names a person on a business workflow, or the reverse) is reported as `invalid_workflow` with a clear message, not as something to retry.

- A document is captured only when all four of its corners are in the frame, with a little space past each. This applies to auto-capture and the shutter button, which stays disabled (and says why) until the corners are in view. A passport can no longer be photographed with its machine-readable zone cut off.
- The saved photo is cropped to the document's detected corners plus that space, not to the on-screen guide.
- New capture hints: "Place your ID inside the frame", "Fit all four corners of your ID inside the frame" and "Move back a little so there is space around your ID".
- Android now detects the document's edges (it previously relied on text alone).
- An app whose native code has not been rebuilt keeps the earlier behaviour.

## 3.6.0

The entry point is now `Verification`, and the flow carries the Toden brand. The package name is unchanged.

No native code changed in this version.

**Deploy note for Toden:** this version calls the verification API under `/api/v1`. Production and Sandbox both serve it.

### New names

- The entry points are `Verification`, `useVerification` and `VerificationConfig`.
- `KYC`-prefixed names are now `Verification`-prefixed: `VerificationError`, `VerificationSubmission`, `VerificationResult`, `VerificationStep`.

Every earlier name still works as a deprecated alias (`MyazaKYC`, `useMyazaKYC`, the hook's `MyazaKYCModal`, `KYCError` and the rest). Existing code needs no change.

Not renamed: the package, the native library names, the iOS pod (`KycSdkReactNative`) and the Android package id.

### Brand

- The flow says Toden where it said Myaza: the footer logo, the consent notice (which now links to toden.co/legal) and the default wording.
- New default colours: a neutral grey scale in place of the purple-tinted one. Colours set through `appearance` or a workflow are unchanged.
- Headings, and text at 16px and up, are set in Bricolage Grotesque. Smaller text and anything typed into a field is Geist. Both ship inside the package. An organisation's own font still replaces both.
- The NFC step uses the phone-and-chip icon, matching the dashboard.

### API address

The SDK calls the verification API under `/api/v1` (for example `/api/v1/verify`). The earlier `/api/kyc` addresses keep working on the server, so older versions of the SDK are unaffected.

### Fixes

- The dark header uses the same surface colour as the cards. It was a pale purple band.

## 3.5.0

A full-screen liveness camera, signing on screen, and no selfie review by default.

**This version needs a native rebuild.** It adds two native views (the blur around the liveness camera's face window, and a guard that keeps the page still while signing on iPhone) and the `expo-haptics` dependency, so run `pod install` on iOS and rebuild both apps.

### The liveness camera is full screen

While the liveness camera is live it now takes the whole sheet. The camera fills the screen, sharp inside a tall window for the face and blurred everywhere around it, with the instruction above the window and the step count below. A check that runs out of time stays on the camera, with the reason and Try Again under the window, and the review shows the photo in the same window.

The blur is drawn by the SDK itself, with no new dependency. On Android it needs Android 12 or later; older phones show a plain tint around the window instead.

No change to your code.

### People already being checked get background monitoring

The SDK switches background monitoring on right after a verification. People verified before it did that, and people on always-on monitoring, never pass that step again, so their checks collected app-open reports only. `reportAddressPresence()`, the call your app already makes when it opens, now does it for them: when the person's check is still running (or their always-on monitoring is between two checks) and background monitoring is not on, the report switches it on.

- The person sees the system's "allow all the time" prompt once. The SDK never asks again from a report, whatever they answer.
- If they already allowed it in Settings, it is switched on with no prompt.
- Nothing happens when the check has finished, monitoring was stopped, the server cannot be reached, the workflow has background monitoring off, or `registerBackgroundPresence()` was never called.
- The result carries `background` when the report tried, with the same reasons `enableBackgroundPresence()` gives.

Your app still needs the background location setup, as before. To show your own explanation first, pass `autoBackground: false` and call `enableBackgroundPresence()` when you are ready.

### A stay is reported sooner

The background tier recorded a stay when the person left, or at a "still here" check-in once it had run three hours. Someone who came home and stayed in therefore showed nothing for three hours. The first check-in of a stay now comes after 35 minutes; later ones stay at three hours. With `expo-background-task` installed the SDK asks the OS for a check-in about every 40 minutes instead of every two hours. The OS still decides when one runs.

`presenceStay(externalUserId)` returns the stay the phone has open (`since` and `nextReportAt`, epoch milliseconds), or `null`, so your app can tell the person a report is on its way.

### The app no longer closes when an optional package is half installed

Switching background presence on closed the app in a release build when `expo-background-task` was installed as JavaScript but its native module was not in the app build (a monorepo that hoists it, or a package added without a rebuild). Loading such a package fails while it starts up, and a release build treats that as fatal even inside a `try`.

The SDK now asks Expo whether the native module is there before loading any optional package: `expo-background-task`, `expo-task-manager`, `expo-brightness`, `expo-document-picker`, `expo-haptics` and `expo-crypto`. A missing one is skipped, as an uninstalled one always was.

### Reading the check's status

`fetchPresenceWatchStatus({ apiKey, externalUserId })` returns where the check stands on the server: its status, progress from 0 to 1, nights and days counted, and when it ends. It never throws; `null` means the server could not be reached. No native rebuild is needed.

### No selfie review unless you ask for one

**This changes existing integrations.** After the liveness capture the SDK used to show the selfie with Retake and Continue. It now hands straight on to the next step. A liveness selfie is evidence, not a portrait, and the capture already waits for a face that is in the window and still.

Switch the review back on with `selfieReview` on the config, or with the switch on the workflow's Presence Intelligence step. On a biometric workflow its own setting wins. A selfie that fails to upload still shows the review, which is where the retry is.

### Going back to a finished liveness step

Going back to the liveness step after the selfie is taken now shows "Selfie already taken" with the photo and Continue. There is no Retake, so the check runs once per session.

### Sign a supporting document on screen

A supporting document in a workflow can now be signed on screen. The workflow sets `capture` on the document: `upload` (the default, as before), `draw` (a signature drawn on screen) or `draw_or_upload` (either). The person signs in a box with Clear and an Expand button for more room, and "Use this signature" stays disabled until there is real ink. With `draw_or_upload` they can switch to "Upload a photo of your signature instead".

After saving, the card shows the signature with an Edit action that reopens the box with the signature in it. A session picked up later shows a mark that it was signed, not the drawing itself.

Existing workflows are unchanged: a document with no `capture` is uploaded as before. The server must be on a version that accepts drawn signatures.

On iPhone, signing no longer scrolls the page or drags the sheet down.

### Taps in the hand, not a buzz

Each liveness step that passes now gives a light tap, and a finished capture or chip read a firmer one: the same two taps as the Flutter SDK. They come from `expo-haptics`, which is now a dependency, so they need a native rebuild. An iPhone app not yet rebuilt feels nothing rather than the phone's long buzz; Android gives a short tick.

### The SDK stands down when monitoring is stopped

When your organisation stops address monitoring for a user, the next `reportAddressPresence()` switches background location off and the Android foreground service for that user, forgets the stored address and answers the new reason `'stopped'`. Before this the phone kept reporting to a check that no longer existed.

`standDownPresence(externalUserId)` does the same on request.

### The footer reads "Protected by"

The footer under every step now reads "Protected by" with the Myaza mark, as the web SDK does. It read "Powered by". A custom footer logo already read "Protected by".

### One spinner everywhere

Every loading state now shows the same spinner as the web SDK, in place of the platform's own. The pulsing loader is that spinner too.

### The flash check tells the server when each colour came on

The submission now carries the time each flash colour came on, measured from the start of the recording, so the server's own check of the recording looks in the right place. Exposure and white balance are held still for the sequence where the phone supports it. No change to your code, and an older server ignores the new field.

### The hosted map gets longer to load

The SDK waited 8 seconds for the hosted map before falling back to the built-in one. It now waits 20 seconds, which a slow connection needs.

### Opening the flow with a refresh no longer closes it on iPhone

Opening the flow while refreshing its workflow mounted the sheet, took it down and mounted it again, which iOS showed as the flow closing. The two now happen in one update.

## 3.4.0

Device integrity and app attestation signals, and a screen for a cancelled verification.

**This version needs a native rebuild.** It adds native code (a new device-intelligence module in Swift and Kotlin, and the Play Integrity Gradle dependency).

### Device integrity and app attestation

When the workflow's Device Intelligence is on, the SDK now sends:

- the same per-install device ID on every upload as in the submission's fingerprint;
- a stable device ID that survives a reinstall (a Keychain value on iOS, `ANDROID_ID` on Android);
- root, jailbreak and hooking checks, with no permission or prompt;
- an attestation of the app: App Attest on iOS and the Play Integrity Standard API on Android, against a single-use challenge from the server, given at most about five seconds and left out if anything fails.

Attestation needs one-off setup in your app: the App Attest capability on iOS, and linking your app to Myaza's Google Cloud project in Play Console on Android. See "Device Intelligence (device signals and attestation)" in the README. Without it, attestation is simply left out and the rest of the flow is unchanged.

### A screen for a cancelled verification

An organisation or Myaza support can now cancel a verification session midway. When the server says a session is cancelled (on start, on a progress save, on submission, or in the result check), the flow stops on a screen reading "This verification was cancelled", with the server's message and a Close button. There is no Try again or Go back: the session cannot continue until it is reopened from the dashboard. `onError` fires once with the new code `session_cancelled`.

A failed session start used to be ignored so the flow could carry on. A cancelled session is the one exception: the flow now stops instead of walking the person through steps the server will refuse.

## 3.3.1

The business applicant's own check is sent with its application, and a way back after a refused submission. No native rebuild is needed.

### The applicant's own check reaches the server

In a business application, the applicant's own identity check was sent without the application's session. The server refuses that, the refusal went unnoticed, and the flow ended on success with the applicant never verified; reopening the app resumed at the applicant's ID step. The check is now sent with the session, as the web SDK does.

### Go back after a refused submission

When the server refused a submission, the error screen offered only Close, even when its message asked the person to fix something earlier in the flow. It now also offers Go back, which returns to the step that can fix the refusal: company documents, company details, key people, supporting documents, questionnaire, proof of address, address, or the photo a refused upload names. When the refusal doesn't point at one step, Go back returns to the step before submission. Coming back to the end submits again. Refusals that going back can't fix (not enough credits, an invalid API key) still show Close alone.

## 3.3.0

Background presence now records a stay while the person is still at home, the progress bar becomes the default indicator, plus fixes on the address confirmation screens.

No native rebuild is needed for these changes. The periodic background check-in is optional and needs `expo-background-task`, which does need a rebuild if you add it.

### The progress bar is now the default indicator

A workflow or config that doesn't choose a progress indicator now shows the thin bar on the header's bottom edge instead of the numbered step circles. To keep the circles, set `progressStyle: 'steps'` (or choose Steps in the workflow builder). Workflows that already chose a style are unchanged.

### "Edit" keeps clear of the entrance photo on the address review

On the "Confirm your address" card, the "Edit" link sat right against the entrance photo that hangs over the card. When a photo is there, "Edit" now sits under the address instead; without one it stays where it was.

### The address intro button now reads "Continue"

The button on the "Let's confirm your address" screen said "Got it, let's go". Google Play's guidance for the disclosure shown before a background location request asks for a clear accept button rather than a vague "Got it", and a reviewer can treat this screen as that disclosure. The default is now "Continue". If you set your own text for `address.intro.start`, nothing changes for you.

### "Still here" check-ins for background presence

A geofence only reports when the person crosses its edge, so a stay used to be recorded only when they left: someone who hardly leaves home earned little background evidence, and one exit the phone failed to report capped a multi-day stay at 24 hours. The SDK now records a stay while the person is still there, once it has run three hours: on every app open (an inside `reportAddressPresence()` reading), on each reading of the Android foreground service, and, if you install the optional `expo-background-task`, on a periodic background check-in about every two hours. No new permission is needed.

## 3.2.0

Passive Liveness, customisable texts, the organisation's own footer logo, silent capture and a bright screen during liveness.

**Rebuild your native app after upgrading:** this release adds the native module `expo-brightness` as a dependency of the SDK. You do not install it yourself, and you should not add its config plugin (it declares `WRITE_SETTINGS`, which the SDK never uses).

These features need the Myaza server release of 2026-09-28. Against an older server the flow still completes: the new settings are simply ignored, and silent frames are refused at upload and left out.

### Passive Liveness, and a head turn in every 3D Active Motion run

`livenessMode: 'passive'` asks the person to hold still for a moment while the SDK records a short clip and takes the selfie. There are no prompts: Myaza's liveness model decides from the capture. 3D Active Motion now always includes a head turn, and the SDK reports the prompts it ran.

### The liveness result is sent with the submission

Builds up to 3.1.0 recorded the liveness result and never sent it, so the server could not audit it. It is sent now. A flash sequence that could not be measured no longer counts as passed, and a recording that fails to upload is reported with its reason.

### A bright screen during liveness

While the liveness camera is on, the flow shows its light theme and raises the screen to full brightness, then restores both. Android changes the brightness of the SDK's own window only, never the system setting; iOS uses `expo-brightness` and reverts on lock. A workflow turns this off with `livenessBrightScreen: false`.

### Customisable texts

A workflow can reword the main text of each screen through its `texts` setting, on the same keys as the web SDK.

### The organisation's own footer logo

When a workflow uses custom trust branding, its logo replaces the Myaza mark in the footer, and the consent notice names Myaza Trust as the processor for the organisation.

### Silent capture

On the document review, the SDK briefly opens the front camera with no prompt, flash or shutter sound and takes one frame of the person holding the ID. It is on by default; a workflow turns it off with `silentCapture: false`.

### Selfie guidance

The selfie primer asks for a bright spot with no glare and an uncovered face (glasses off), and no longer states a duration.

### Logos in local development

With a development key, a workflow's own logo and the footer logos now load over a USB tunnel (`adb reverse`) or after your machine's network address changes, like the organisation logo. Production is unaffected.

### Background monitoring is on by default, and the SDK turns it on

When a presence flow is submitted, the SDK now asks the person to allow location all the time and arms the background geofence itself, unless the workflow switches Background monitoring off. You no longer call `enableBackgroundPresence()` for it. It still needs your app's one-time setup (`expo-task-manager`, the `location: "always"` plugin setting, and `registerBackgroundPresence()` at your app's root). Without that setup the SDK skips the step and asks for nothing: `enableBackgroundPresence()` now returns the new reason `not_registered` when `registerBackgroundPresence()` never ran, instead of arming a fence nothing would handle.

### The SDK sends the first presence report itself

When a workflow enables presence verification, the SDK now reports presence on its own the moment the flow is submitted, so the watch gets its first day (and night, when submitted at night) without any code in your app. Until now every observation depended on your app calling `reportAddressPresence()`, and apps that had not added that call produced watches that collected nothing and lapsed as inconclusive.

Later days still come from your app: keep calling `reportAddressPresence()` on app open, or enable background monitoring. A call you already make at submit is harmless, since one day's reports merge into one. The pin is stored under your `userId`, so pass one: without it there is nothing to report against, and the server now starts no watch.

## 3.1.0

### The icon set is Hugeicons, the same one the web and Flutter SDKs draw

The other two SDKs moved to Hugeicons some time ago and this one did not, so
the three agreed on names and differed on every glyph. They now draw one set.

Nothing about the integration changes. The icons are internal, so no exported
type or prop moved, and the only visible difference is the drawing itself: the
glyphs are Hugeicons' Stroke Rounded at a 1.6 stroke rather than Lucide's at 2,
which reads slightly lighter. If you have screenshot tests over the flow, expect
them to need new baselines.

The bundle gets SMALLER, by 1.33 MB on a minified production build, because
Lucide's own barrel was not tree-shaking either.

Two details worth knowing if you ever fork or patch this package. Icons are
imported one module at a time (`@hugeicons/core-free-icons/Camera01Icon`) and
must stay that way: importing from the package index instead pulls all 6,025
icons into the bundle, measured at +8.33 MB for five icons against +7 KB the
deep way. And the theme toggle's moon and sun are no longer filled — that
worked because Lucide's glyph bodies take a fill, and Hugeicons' free pack is
Stroke Rounded only, so they are stroked now, which is what the Flutter SDK has
always done.

### A brand colour now tints cards as well as the sheet

`appearance.primaryColor` derives three faint washes used behind numbered
markers, pills and selected rows. They were pre-blended against the sheet
background, but they are drawn on several surfaces, and on a card the 10% wash
landed within 3/255 of the card underneath it — close enough to be invisible.
The supporting-documents step showed it most clearly: its numbered markers were
there and could not be seen.

They carry real alpha now, so each one composites against whatever it is
actually drawn on, which is what the web SDK has always done. On a card the
result is identical to the web SDK's; on the sheet it matches the old value to
within 1/255. Flows that set no `primaryColor` are untouched.

### Supporting documents

The step is at visual parity with the web and Flutter SDKs: each requested
document is a card naming what it is being collected for, with the fields the
server will read off it, rather than a bare upload slot.

Two fixes behind it. The consent screen now discloses the step, which it never
did. And `supportingDocuments` reaches the SDK at all: the key was missing from
the workflow merge, so a workflow-mounted flow never received the block and the
whole feature was inert — no step, and nothing on consent.

### The liveness ring starts and closes at the top

It drew from three o'clock while its own comment said twelve. The rotation sat
on the root `<Svg>`, which react-native-svg silently drops, so it never applied.
It matches the Flutter SDK now.


## 3.0.0

### NFC is genuinely opt-in now (breaking)

The config plugin has always taken an `nfc` option that defaults to off, but the
library's own `AndroidManifest.xml` declared `android.permission.NFC` and a
`uses-feature` entry unconditionally. A library manifest is merged into every
host app, so the permission reached every integrator regardless of the option —
including the majority whose workflows never read a chip, and who had no way to
remove it. The opt-in only ever governed iOS.

Both declarations have moved into the plugin and are written only on
`nfc: true`:

```jsonc
["@myazahq/kyc-sdk-react-native", { "nfc": true }]
```

**If you read chips on Android and have not set `nfc: true`, set it now.**
Without it the permission is no longer declared and the chip step will find no
radio. Apps that never read chips need no change and lose a permission they
never asked for. iOS is unaffected: the reader entitlement and usage string
were already behind this option, because adding them unconditionally breaks
code signing for any App ID without the "NFC Tag Reading" capability.

The permission and the `uses-feature` declaration are written together and can
never be separated. Android infers `uses-feature android:required="true"` from
`android.permission.NFC` when the feature is not declared explicitly, and Play
then hides the app from every device without an NFC radio. That failure has no
runtime symptom — the app builds, installs and runs perfectly on the developer's
own NFC-capable phone, and is simply absent from the store listing for everyone
else — so the pairing is pinned by a test rather than left to review.

This changes permissions only. It removes no code: `edu.ucar:jj2000`, the
JPEG 2000 decoder for the chip portrait, is referenced by `Jp2Decoder.kt` at
compile time and still ships. The chip step continues to check for a radio at
runtime and skip itself when there is none, so a build without the permission
behaves exactly like a phone with no NFC hardware.

### The ML Kit models are fetched, not bundled

Face detection and text recognition now resolve to the
`play-services-mlkit-*` artifacts, so their models are downloaded through
Google Play Services on first use instead of shipping inside your APK. That is
roughly 18.5 MB per device off the install, measured on an arm64 release build
of the example app: 57.67 MB bundled against 45.73 MB fetched.

No integration change. The flow starts both downloads the moment it opens, so
they overlap consent and ID selection, and each step checks its own model
before opening a camera: a device still waiting shows a brief "getting ready"
state rather than a viewfinder that cannot see anything.

Fleets without Play Services at all (bare AOSP, some Huawei devices) should
keep the models embedded:

```gradle
// android/build.gradle
ext { myazaKycBundledMlKit = true }
```

### Android document captures were cropping the wrong region

A capture was cropped using dimensions from React Native's `Image.getSize`,
which on Android reports DP — pixels divided by display density — while the
cropper works in real pixels. On a density-2 phone a 3048x4064 photo measured
1524x2032, so a crop computed as centred was applied at half scale and landed
in the upper-left quadrant. The document your user framed was often not in the
stored photo, and it failed silently: no error, just an image that failed to
read later.

Every Android density is greater than one, so this affected every Android
document capture, wrong by the device's own density factor. iOS was unaffected.
Dimensions are now measured through the same module that performs the crop.

### Fixed

- **A crash when liveness detected a face (Android).** The face detector read
  the camera frame inside ML Kit's completion callback, by which point the
  frame could already have been recycled: `IllegalStateException: Image is
  already closed`. It surfaced with the fetched models, whose answers arrive
  over IPC and so more often land after the frame is gone.
- **The models were not pre-fetched for `useMyazaKYC`.** Only the
  `<MyazaKYC />` component started the downloads, so hook-based integrations
  first requested the face model when the applicant reached liveness, in front
  of an already-open camera. Both entry points now warm them at open.
- **The liveness step now says it is preparing.** It previously opened the
  camera while the model was still arriving and asked the applicant to position
  a face that could not register.
- **Capture header and document pill on small screens.** With a long document
  name the step counter wrapped alone to the right edge, and the country flag
  floated between two lines of the title.
