package com.margelo.nitro.myazakyc

import androidx.camera.core.ImageProxy
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame

/**
 * Android half of document edge detection, implementing the nitrogen-generated
 * `HybridMyazaRectDetectorSpec` from src/specs/MyazaRectDetector.nitro.ts.
 *
 * ML Kit has no frame-by-frame rectangle detector, so this runs the SDK's own
 * border detector ([DocumentBorderDetector], a port of the web SDK's) over a
 * small upright copy of the frame's luma plane. What it reports matters most as
 * the four CORNERS: the capture gate shoots only when all four are in view with
 * space past each, so a passport is never saved with its MRZ cut off.
 *
 * It finds rectangles that sit square to the frame (a slight tilt still passes
 * its border test). Anything it cannot read reports `found = false`, and the
 * TypeScript gate then asks the user to place the document in the frame.
 */
class HybridMyazaRectDetector : HybridMyazaRectDetectorSpec() {

  private val detector = DocumentBorderDetector()

  override fun setExpectUpright(upright: Boolean) {
    detector.upright = upright
  }

  override fun detectRect(frame: HybridFrameSpec): DetectedRect {
    val proxy: ImageProxy = (frame as? NativeFrame)?.image ?: return NOT_FOUND
    return try {
      val plane = proxy.planes.firstOrNull() ?: return NOT_FOUND
      val rotation = proxy.imageInfo.rotationDegrees
      val luma = DocumentLuma.fromLumaPlane(
        plane.buffer, plane.rowStride, plane.pixelStride, proxy.width, proxy.height, rotation,
      )
      val found = detector.detect(luma) ?: return NOT_FOUND
      val (uw, uh) = DocumentLuma.uprightSize(proxy.width, proxy.height, rotation)
      val width = found.right - found.left
      val height = found.bottom - found.top
      DetectedRect(
        found = true,
        x = found.left,
        y = found.top,
        width = width,
        height = height,
        // The shape in PIXELS: what tells an ID card (1.586) from a passport page (1.42).
        aspect = if (height > 0) (width * uw) / (height * uh) else 0.0,
        confidence = found.score.coerceIn(0.0, 1.0),
        topLeftX = found.left, topLeftY = found.top,
        topRightX = found.right, topRightY = found.top,
        bottomRightX = found.right, bottomRightY = found.bottom,
        bottomLeftX = found.left, bottomLeftY = found.bottom,
        frameWidth = uw.toDouble(),
        frameHeight = uh.toDouble(),
      )
    } catch (_: Throwable) {
      // One bad frame must not take the scan down; the next gets its own try.
      NOT_FOUND
    }
  }

  private companion object {
    val NOT_FOUND = DetectedRect(
      found = false, x = 0.0, y = 0.0, width = 0.0, height = 0.0, aspect = 0.0, confidence = 0.0,
      topLeftX = 0.0, topLeftY = 0.0, topRightX = 0.0, topRightY = 0.0,
      bottomRightX = 0.0, bottomRightY = 0.0, bottomLeftX = 0.0, bottomLeftY = 0.0,
      frameWidth = 0.0, frameHeight = 0.0,
    )
  }
}
