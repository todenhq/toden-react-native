package com.margelo.nitro.myazakyc

import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android border detector on synthetic frames: a bright card on a dark
 * table, the same card running off the bottom of the frame, and an empty frame.
 */
class DocumentBorderDetectorTest {
  private val detector = DocumentBorderDetector()

  /** An upright W×H luma frame: dark background, a bright card in (l,t)..(r,b) pixels. */
  private fun frame(w: Int, h: Int, l: Int, t: Int, r: Int, b: Int): ByteArray {
    val px = ByteArray(w * h) { 30 }
    for (y in maxOf(0, t) until minOf(h, b)) for (x in maxOf(0, l) until minOf(w, r)) px[y * w + x] = 220.toByte()
    return px
  }

  private fun luma(px: ByteArray, w: Int, h: Int, rotation: Int = 0) =
    DocumentLuma.fromLumaPlane(ByteBuffer.wrap(px), w, 1, w, h, rotation)

  @Test
  fun findsACardOnADarkBackground() {
    // A portrait 720×1280 frame with an ID-1 card (1.586:1) across the middle.
    val w = 720; val h = 1280
    val cardW = 560; val cardH = (cardW / 1.586).toInt()
    val l = (w - cardW) / 2; val t = (h - cardH) / 2
    val found = detector.detect(luma(frame(w, h, l, t, l + cardW, t + cardH), w, h))
    assertNotNull(found)
    found!!
    assertEquals(l.toDouble() / w, found.left, 0.02)
    assertEquals((l + cardW).toDouble() / w, found.right, 0.02)
    assertEquals(t.toDouble() / h, found.top, 0.02)
    assertEquals((t + cardH).toDouble() / h, found.bottom, 0.02)
  }

  @Test
  fun doesNotReportACardRunningOffTheBottomEdge() {
    // The passport photographed with its MRZ cut off: no bottom border in frame.
    val w = 720; val h = 1280
    val cardW = 560; val cardH = (cardW / 1.42).toInt()
    val l = (w - cardW) / 2; val t = h - cardH / 2
    assertNull(detector.detect(luma(frame(w, h, l, t, l + cardW, t + cardH), w, h)))
  }

  @Test
  fun reportsNothingOnAnEmptyFrame() {
    val w = 720; val h = 1280
    assertNull(detector.detect(luma(ByteArray(w * h) { 30 }, w, h)))
  }

  @Test
  fun turnsASidewaysSensorFrameUpright() {
    // The sensor delivers 1280×720 rotated 90°; upright it is the 720×1280 frame.
    val uw = 720; val uh = 1280
    val cardW = 560; val cardH = (cardW / 1.586).toInt()
    val l = (uw - cardW) / 2; val t = 200
    val upright = frame(uw, uh, l, t, l + cardW, t + cardH)
    // Sensor (sx, sy) shows upright (uh - 1 - sy, sx) after a 90° clockwise turn.
    val sw = uh; val sh = uw
    val sensor = ByteArray(sw * sh)
    for (sy in 0 until sh) for (sx in 0 until sw) sensor[sy * sw + sx] = upright[sx * uw + (sh - 1 - sy)]
    val l90 = luma(sensor, sw, sh, rotation = 90)
    assertEquals(DocumentLuma.uprightSize(sw, sh, 90), Pair(uw, uh))
    val found = detector.detect(l90)
    assertNotNull(found)
    assertEquals(t.toDouble() / uh, found!!.top, 0.02)
    assertEquals(l.toDouble() / uw, found.left, 0.02)
  }

  /** A NIN slip (2.07) framed upright in a portrait frame, as the phone shows it. */
  private fun uprightSlip(): Triple<ByteArray, Int, Int> {
    val w = 720; val h = 1280
    val slipH = 900; val slipW = (slipH / 2.07).toInt()
    val l = (w - slipW) / 2; val t = (h - slipH) / 2
    return Triple(frame(w, h, l, t, l + slipW, t + slipH), w, h)
  }

  @Test
  fun findsAnUprightSlipOnlyWhenAskedTo() {
    val (px, w, h) = uprightSlip()
    // The landscape search never finds it: this is why Android never captured.
    assertNull(DocumentBorderDetector().detect(luma(px, w, h)))
    val upright = DocumentBorderDetector().apply { upright = true }
    val found = upright.detect(luma(px, w, h))
    assertNotNull(found)
    found!!
    val ratio = ((found.right - found.left) * w) / ((found.bottom - found.top) * h)
    assertEquals(1 / 2.07, ratio, 0.05)
  }

  @Test
  fun theUprightSearchDoesNotTakeALandscapeCard() {
    val w = 720; val h = 1280
    val cardW = 560; val cardH = (cardW / 1.586).toInt()
    val l = (w - cardW) / 2; val t = (h - cardH) / 2
    val upright = DocumentBorderDetector().apply { upright = true }
    assertNull(upright.detect(luma(frame(w, h, l, t, l + cardW, t + cardH), w, h)))
  }

  @Test
  fun findsAnUprightSlipWhoseTopEdgeIsFaint() {
    // Pale paper on a pale laptop: the slip's top (the right side, turned) shows
    // along only 30% of its length, and a dashed printed border runs just inside
    // it. The slip is found, and its edge is the paper's, not the printed line.
    val w = 720; val h = 1280
    val slipH = 900; val slipW = (slipH / 2.07).toInt()
    val l = (w - slipW) / 2; val t = (h - slipH) / 2; val r = l + slipW; val b = t + slipH
    val px = frame(w, h, l, t, r, b)
    val visibleTo = t + (slipH * 0.3).toInt()
    for (y in visibleTo until b) for (x in r until w) px[y * w + x] = 220.toByte()
    val line = l + (slipW * 0.86).toInt()
    for (y in t until b) if ((y / 20) % 2 == 0) for (x in line until line + 2) px[y * w + x] = 60
    val found = DocumentBorderDetector().apply { upright = true }.detect(luma(px, w, h))
    assertNotNull(found)
    found!!
    assertEquals(l.toDouble() / w, found.left, 0.02)
    assertEquals(r.toDouble() / w, found.right, 0.02)
    assertEquals(t.toDouble() / h, found.top, 0.02)
    assertEquals(b.toDouble() / h, found.bottom, 0.02)
  }

  @Test
  fun turnsASensorFrameAtRotation270Upright() {
    // Some phones mount the back sensor the other way: 1280×720 turned 270°.
    val uw = 720; val uh = 1280
    val slipH = 900; val slipW = (slipH / 2.07).toInt()
    val l = 100; val t = 160
    val upright = frame(uw, uh, l, t, l + slipW, t + slipH)
    // Turned 270° clockwise, upright (ux, uy) comes from sensor (sw - 1 - uy, ux).
    val sw = uh; val sh = uw
    val sensor = ByteArray(sw * sh)
    for (sy in 0 until sh) for (sx in 0 until sw) sensor[sy * sw + sx] = upright[(sw - 1 - sx) * uw + sy]
    val found = DocumentBorderDetector().apply { this.upright = true }.detect(luma(sensor, sw, sh, rotation = 270))
    assertNotNull(found)
    found!!
    assertEquals(l.toDouble() / uw, found.left, 0.02)
    assertEquals((l + slipW).toDouble() / uw, found.right, 0.02)
    assertEquals(t.toDouble() / uh, found.top, 0.02)
    assertEquals((t + slipH).toDouble() / uh, found.bottom, 0.02)
  }

  /**
   * A NIN slip as it really looks: pale paper with a printed inner border and
   * blocks of print, upright in a 720×1280 frame, its paper at (l,t)..(r,b)
   * (which may run past the frame).
   */
  private fun printedSlip(l: Int, t: Int, r: Int, b: Int, border: Double = 0.06): ByteArray {
    val w = 720; val h = 1280
    val px = ByteArray(w * h) { 60 }
    fun set(x: Int, y: Int, v: Int) { if (x in 0 until w && y in 0 until h) px[y * w + x] = v.toByte() }
    for (y in t until b) for (x in l until r) set(x, y, 225)
    val m = ((r - l) * border).toInt()
    for (x in l + m until r - m) for (d in 0..2) { set(x, t + m + d, 40); set(x, b - m - d, 40) }
    for (y in t + m until b - m) for (d in 0..2) { set(l + m + d, y, 40); set(r - m - d, y, 40) }
    var x = l + m + 20
    while (x < r - m - 20) {
      var y = t + m + 20
      while (y < b - m - 20) { for (yy in y until y + 6) for (xx in x until x + 8) set(xx, yy, 50); y += 10 }
      x += 22
    }
    return px
  }

  @Test
  fun findsAPrintedSlipThatIsWhollyInView() {
    val slipH = 1000; val slipW = (slipH / 2.07).toInt()
    val l = (720 - slipW) / 2; val t = (1280 - slipH) / 2
    val found = DocumentBorderDetector().apply { upright = true }.detect(luma(printedSlip(l, t, l + slipW, t + slipH), 720, 1280))
    assertNotNull(found)
    assertEquals(l / 720.0, found!!.left, 0.02)
    assertEquals((l + slipW) / 720.0, found.right, 0.02)
  }

  @Test
  fun doesNotInventTheSideOfASlipRunningOffTheFrame() {
    // The slip's right side is past the frame. A column of print, or the
    // printed border, used to stand in for it: found at 0.80 of the frame for
    // the larger slip, inside the 0.91 an upright Galaxy S24 shows, so all four
    // "corners" were in view of a slip that is not.
    for ((slipH, l, border) in listOf(Triple(1300, 106, 0.1), Triple(1000, 268, 0.0), Triple(1000, 238, 0.1))) {
      val slipW = (slipH / 2.07).toInt()
      val t = (1280 - slipH) / 2
      assertTrue(l + slipW > 720)
      val found = DocumentBorderDetector().apply { upright = true }
        .detect(luma(printedSlip(l, t, l + slipW, t + slipH, border), 720, 1280))
      // Anything still found reaches past the screen's edge, where the corner
      // gate refuses it.
      if (found != null) assertTrue("slip $slipH at $l: found right ${found.right}", found.right > 0.91)
    }
  }

  @Test
  fun findsNothingInsideASlipTooBigForTheFrame() {
    // Held so close the paper runs past every edge: only its print is in view,
    // and none of that is the slip's outline.
    val slipH = 1500; val slipW = (slipH / 2.07).toInt()
    for (dx in listOf(0, 60, 120, 180)) {
      val l = (720 - slipW) / 2 + dx; val t = (1280 - slipH) / 2
      for (border in listOf(0.06, 0.1)) {
        val found = DocumentBorderDetector().apply { upright = true }
          .detect(luma(printedSlip(l, t, l + slipW, t + slipH, border), 720, 1280))
        assertNull("dx $dx border $border", found)
      }
    }
  }
}
