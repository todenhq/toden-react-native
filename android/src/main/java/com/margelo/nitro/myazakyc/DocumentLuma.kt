package com.margelo.nitro.myazakyc

import java.nio.ByteBuffer

/**
 * A small, UPRIGHT greyscale copy of a camera frame, for DocumentBorderDetector.
 *
 * Read straight from the frame's luma (Y) plane: luma IS greyscale, so there is
 * no colour conversion to pay for. The sensor delivers the frame turned by
 * `rotationDegrees` (clockwise to make it upright); sampling through that turn
 * here means every coordinate the detector reports is already in the upright
 * frame the user sees, which is what the corner gate compares against.
 *
 * Pure Kotlin on purpose (only java.nio), so it runs in a plain JVM unit test.
 */
class DocumentLuma(
  val width: Int,
  val height: Int,
  val pixels: FloatArray,
) {
  companion object {
    /** The longer side of the detection image. The web SDK detects at 240×150. */
    const val DETECT_LONG_SIDE = 240

    /** The frame's size once turned upright: a quarter turn swaps the sides. */
    fun uprightSize(width: Int, height: Int, rotationDegrees: Int): Pair<Int, Int> =
      if (isQuarterTurn(rotationDegrees)) Pair(height, width) else Pair(width, height)

    private fun isQuarterTurn(rotation: Int): Boolean {
      val r = ((rotation % 360) + 360) % 360
      return r == 90 || r == 270
    }

    /**
     * Downscale the Y plane into an upright image whose longer side is
     * [DETECT_LONG_SIDE], keeping the frame's own aspect so a card's measured
     * shape is its real shape. Each output pixel averages a 3×3 grid of samples,
     * which keeps sensor noise from reading as edges.
     */
    fun fromLumaPlane(
      plane: ByteBuffer,
      rowStride: Int,
      pixelStride: Int,
      width: Int,
      height: Int,
      rotationDegrees: Int,
    ): DocumentLuma {
      val (uw, uh) = uprightSize(width, height, rotationDegrees)
      val scale = DETECT_LONG_SIDE.toDouble() / maxOf(uw, uh)
      val outW = maxOf(1, Math.round(uw * scale).toInt())
      val outH = maxOf(1, Math.round(uh * scale).toInt())
      val r = ((rotationDegrees % 360) + 360) % 360
      val cellW = uw.toDouble() / outW
      val cellH = uh.toDouble() / outH
      val out = FloatArray(outW * outH)

      for (oy in 0 until outH) {
        for (ox in 0 until outW) {
          var sum = 0
          for (sy in 0 until 3) {
            for (sx in 0 until 3) {
              val ux = minOf(uw - 1, ((ox + (sx + 0.5) / 3) * cellW).toInt())
              val uy = minOf(uh - 1, ((oy + (sy + 0.5) / 3) * cellH).toInt())
              // Upright (ux, uy) back to the sensor's own coordinates.
              val (px, py) = when (r) {
                90 -> Pair(uy, height - 1 - ux)
                180 -> Pair(width - 1 - ux, height - 1 - uy)
                270 -> Pair(width - 1 - uy, ux)
                else -> Pair(ux, uy)
              }
              sum += plane.get(py * rowStride + px * pixelStride).toInt() and 0xFF
            }
          }
          out[oy * outW + ox] = sum / 9f
        }
      }
      return DocumentLuma(outW, outH, out)
    }
  }
}
