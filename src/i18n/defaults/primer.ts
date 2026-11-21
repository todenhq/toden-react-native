// The "get ready" primers and the camera permission screen.
//
// Keys this SDK shows, each with ITS OWN default: the wording the screen had
// before the key existed, byte for byte. NOT_SHOWN lists the group's keys that
// name a place this SDK has no screen for, each with the reason.
//
// {document} is the short name of the document the person chose ("Passport",
// "National ID Card"): components/readyPrimerContent.ts documentReady.

export const PRIMER_TEXTS: Record<string, string> = {
  // Before the document camera (components/readyPrimerContent.ts READY_DOCUMENT).
  // The title and the description show only where a workflow has written its
  // own: the step heading above already names the document and says what to do.
  'primer.document.title': "You're about to scan your {document}",
  'primer.document.body': "We'll read the details for you. Nothing is shared until you submit.",
  'primer.document.checklist1': 'Have your {document} with you',
  'primer.document.checklist2': 'Find even lighting, avoid glare',
  'primer.document.checklist3': 'Takes a few seconds',
  // Before the selfie camera (READY_LIVENESS, shown by the liveness step). The
  // two descriptions show only where a workflow has written its own: the
  // picture above the title (screens/liveness/GesturePreview) already shows
  // what is about to happen.
  'primer.selfie.title': "Let's confirm you're really here",
  'primer.selfie.body':
    "You'll follow a few short prompts on screen. This proves a real person is present, not a photo or a recording.",
  // The same primer when the workflow uses Passive Liveness (READY_LIVENESS_PASSIVE).
  'primer.selfie.bodyPassive':
    "You'll hold still and look at the camera for a moment. This proves a real person is present, not a photo or a recording.",
  'primer.selfie.checklist2': 'Take off glasses, hats, caps or anything covering your face',
  'primer.selfie.checklist4': 'Choose a bright spot, with the light in front of you',
  'primer.selfie.checklist5': 'Keep glare and shiny reflections off your face',
  // components/ReadyPrimer.tsx.
  'primer.readyButton': "I'm ready",
  // components/CameraPermissionView.tsx CameraPermissionPrimingView (both
  // camera steps); the document step passes the document body.
  'primer.camera.title': 'Allow camera access',
  'primer.camera.body': 'When prompted, allow camera access to continue your verification.',
  'primer.camera.bodyDocument': 'When prompted, allow camera access to photograph your document.',
  'primer.camera.button': 'Grant access',
};

export const PRIMER_NOT_SHOWN: Record<string, string> = {
  'primer.selfie.checklist1':
    'The face check list starts with what to take off: the picture above it shows the window, and the camera says so when the face is not in it',
};
