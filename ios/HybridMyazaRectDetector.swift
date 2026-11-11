import Foundation
import Vision
import CoreMedia
import CoreVideo
import VisionCamera
import NitroModules

// ---------------------------------------------------------------------------
// HybridMyazaRectDetector — document EDGE detection on iOS, implementing the
// nitrogen-generated `HybridMyazaRectDetectorSpec` from
// src/specs/MyazaRectDetector.nitro.ts.
//
// Apple Vision's `VNDetectRectanglesRequest` answers ONE question: is there
// something document-shaped in frame, and where. It cannot answer which
// document it is — an aspect ratio cannot tell a passport from a driver's
// licence — so auto-capture pairs this with text recognition and requires both
// to agree. On its own it would happily shoot a book, a receipt or a laptop.
//
// It also reports the rectangle's four CORNERS, in the upright frame: the
// capture gate shoots only when all four are in view with space past each, so
// a passport is never saved with its machine-readable zone cut off. Android
// answers the same question with DocumentBorderDetector.kt.
// ---------------------------------------------------------------------------

final class HybridMyazaRectDetector: HybridMyazaRectDetectorSpec {

  /// Reused across frames: building the request per frame is measurable at 30fps.
  private let request: VNDetectRectanglesRequest = {
    let r = VNDetectRectanglesRequest()
    // Vision's aspect is short side ÷ long side. An ID-1 card is ~0.63 and a
    // passport data page ~0.70, so 0.4...1.0 admits both, held either way up
    // and at an angle (perspective foreshortens the observed ratio). The TEXT
    // gate is what rejects the wrong document; this only has to find one.
    r.minimumAspectRatio = 0.4
    r.maximumAspectRatio = 1.0
    // A document held up to the camera fills a good share of the frame. Below
    // this it is too far away for OCR to read it anyway.
    r.minimumSize = 0.2
    // Near-square corners. A generous tolerance because the document is rarely
    // exactly parallel to the sensor.
    r.quadratureTolerance = 30
    r.minimumConfidence = 0.6
    // Several candidates, ranked below: asked for one, Vision returns the
    // rectangle it is surest of, which on a desk is often the laptop or the
    // table running off the edge of the picture, while a worn paper slip
    // inside the frame is never reported (2026-11-02).
    r.maximumObservations = 8
    return r
  }()

  /// Apple's document finder (iOS 15+), built for paper documents rather than
  /// any four-sided shape. Asked first; rectangles are the fallback.
  private lazy var documentRequest: VNRequest? = {
    if #available(iOS 15.0, *) { return VNDetectDocumentSegmentationRequest() }
    return nil
  }()

  /// The candidate to report: one wholly inside the picture if any (a shape
  /// running off the edge is a table, a laptop or a document held too close),
  /// the largest of those; otherwise the largest, so the gate still says a
  /// corner is cut off.
  private static func best(_ all: [VNRectangleObservation]) -> VNRectangleObservation? {
    // Written out with explicit types: as one nested closure chain, Xcode's
    // type checker gave up on it ("unable to type-check this expression in
    // reasonable time") in integrators' builds.
    let inside: [VNRectangleObservation] = all.filter { (o: VNRectangleObservation) -> Bool in
      Self.isInsideFrame(o)
    }
    let pool: [VNRectangleObservation] = inside.isEmpty ? all : inside
    return pool.max { (a: VNRectangleObservation, b: VNRectangleObservation) -> Bool in
      Self.area(a) < Self.area(b)
    }
  }

  private static func area(_ o: VNRectangleObservation) -> CGFloat {
    let size: CGSize = o.boundingBox.size
    return size.width * size.height
  }

  private static func isInsideFrame(_ o: VNRectangleObservation) -> Bool {
    let corners: [CGPoint] = [o.topLeft, o.topRight, o.bottomRight, o.bottomLeft]
    let low: CGFloat = 0.01
    let high: CGFloat = 0.99
    for p in corners {
      if p.x <= low || p.x >= high { return false }
      if p.y <= low || p.y >= high { return false }
    }
    return true
  }

  private static let notFound = DetectedRect(
    found: false, x: 0, y: 0, width: 0, height: 0, aspect: 0, confidence: 0,
    topLeftX: 0, topLeftY: 0, topRightX: 0, topRightY: 0,
    bottomRightX: 0, bottomRightY: 0, bottomLeftX: 0, bottomLeftY: 0,
    frameWidth: 0, frameHeight: 0
  )

  /// Vision's aspect bound is short side over long side, so an upright slip is
  /// already found; nothing to change.
  func setExpectUpright(upright: Bool) throws {}

  func detectRect(frame: any HybridFrameSpec) throws -> DetectedRect {
    guard
      let nativeFrame = frame as? NativeFrame,
      let sampleBuffer = nativeFrame.sampleBuffer,
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else {
      return Self.notFound
    }

    // `.right` matches the text recogniser: the camera delivers the buffer
    // rotated 90° relative to how the document is held, and measuring a
    // sideways frame yields a plausible box with the aspect inverted.
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer, orientation: .right, options: [:]
    )

    // The document finder first; a rectangle when it finds nothing usable.
    var observation: VNRectangleObservation? = nil
    if let documentRequest {
      try? handler.perform([documentRequest])
      if let found = (documentRequest.results as? [VNRectangleObservation])?.first,
         found.confidence >= 0.6,
         found.boundingBox.width * found.boundingBox.height >= 0.04 {
        observation = found
      }
    }
    if observation == nil {
      do {
        try handler.perform([request])
      } catch {
        // A detector that fails on one frame must not take the scan down; the
        // next frame gets its own attempt.
        return Self.notFound
      }
      observation = Self.best(request.results ?? [])
    }
    guard let observation else { return Self.notFound }

    let box = observation.boundingBox
    guard box.height > 0, CVPixelBufferGetWidth(pixelBuffer) > 0 else { return Self.notFound }

    // Vision reports a BOTTOM-LEFT origin; the gate's thresholds are written
    // for a top-left origin like every other coordinate in the SDK, so flip y
    // here rather than making every caller remember which convention it got.
    let y = 1.0 - box.origin.y - box.height
    // The corners get the same flip. Vision's `topLeft` is already the top-left
    // corner of the upright image (the `.right` orientation is applied before
    // detection); only its y runs the other way.
    func upright(_ p: CGPoint) -> (Double, Double) { (Double(p.x), Double(1.0 - p.y)) }
    let tl = upright(observation.topLeft)
    let tr = upright(observation.topRight)
    let br = upright(observation.bottomRight)
    let bl = upright(observation.bottomLeft)
    // `.right` turns the landscape buffer upright, so its sides swap.
    let frameWidth = Double(CVPixelBufferGetHeight(pixelBuffer))
    let frameHeight = Double(CVPixelBufferGetWidth(pixelBuffer))

    return DetectedRect(
      found: true,
      x: Double(box.origin.x),
      y: Double(y),
      width: Double(box.width),
      height: Double(box.height),
      // The shape in PIXELS. The box is normalised to a non-square frame, so
      // its own width ÷ height is not the document's (a card in a 9:16 frame
      // would read about 2.8, not 1.586).
      aspect: (Double(box.width) * frameWidth) / (Double(box.height) * frameHeight),
      confidence: Double(observation.confidence),
      topLeftX: tl.0, topLeftY: tl.1,
      topRightX: tr.0, topRightY: tr.1,
      bottomRightX: br.0, bottomRightY: br.1,
      bottomLeftX: bl.0, bottomLeftY: bl.1,
      frameWidth: frameWidth,
      frameHeight: frameHeight
    )
  }
}
