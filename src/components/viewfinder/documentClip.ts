// When a document side's recording runs.
//
// A side's clip records while its camera is live, from the moment the camera
// starts looking for that side until the photo is taken or the length cap
// (MAX_VIDEO_DURATION_MS) stops it. One exception: when the back follows the
// front with nothing tapped, the camera first waits while the person turns the
// document over (useTurnOverHold), and the back's clip starts when that wait
// ends. Started at the side change, it recorded the FRONT for the whole wait,
// and on a slow turn the cap ended it before the back was ever in view: a back
// recording that showed only the front.

export function recordsDocumentClip({
  active,
  ready,
  waitingForTurn,
}: {
  /** The camera is on screen and running. */
  active: boolean;
  /** A camera device is available. */
  ready: boolean;
  /** The "Now turn it over" wait is up. */
  waitingForTurn: boolean;
}): boolean {
  return active && ready && !waitingForTurn;
}
