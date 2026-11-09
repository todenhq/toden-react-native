package com.margelo.nitro.myazakyc

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * Finds a document by its four straight borders — a Kotlin port of the web
 * SDK's detector (sdk-react/src/hooks/useDocumentDetection.ts), so the two
 * judge a frame the same way. ML Kit has no frame-by-frame rectangle detector.
 *
 * Directional Sobel separates horizontal edges (top/bottom borders) from
 * vertical ones (left/right); each border concentrates into a peak in the row
 * or column projection; every pair × pair of peaks is a candidate rectangle,
 * kept only when ALL FOUR sides are continuous high-contrast lines. A face or a
 * busy background has one or two straight sides at best, never four. A card
 * running off the frame has no fourth border, so it is not found at all, which
 * is exactly what the corner gate needs.
 *
 * Pure Kotlin (no Android imports), so it is unit-tested on the JVM.
 */
class DocumentBorderDetector {

  /** A found document, normalised 0..1 in the upright frame (x right, y down). */
  data class Bounds(val left: Double, val top: Double, val right: Double, val bottom: Double, val score: Double)

  /**
   * Looking for a long document framed UPRIGHT (a NIN slip on a phone held
   * upright, src/capture/documentTurn.ts) instead of landscape. Set from the JS
   * thread, read on the camera thread.
   */
  @Volatile var upright: Boolean = false

  companion object {
    // Landscape: cards, passport pages and a NIN slip (2.00 to 2.32 measured).
    private const val RATIO_MIN = 1.15
    private const val RATIO_MAX = 2.45
    // Upright: a slip of 1.45 to 2.45 turned a quarter. Only while asked for, so
    // a door frame or a phone held up never stands in for a card.
    private const val UPRIGHT_RATIO_MIN = 1 / 2.45
    private const val UPRIGHT_RATIO_MAX = 1 / 1.45
    // Three strong sides and a faint fourth, for an upright slip whose top edge
    // shows little against what it lies on (pale paper on a silver laptop). The
    // fourth is looked for only where a slip's shape puts it.
    private const val INFER_RATIO_MIN = 1 / 2.45
    private const val INFER_RATIO_MAX = 1 / 1.9
    private const val WEAK_SIDE_MIN_FILL = 0.12
    private const val MIN_AREA_FRACTION = 0.1
    private const val MAX_AREA_FRACTION = 0.95
    private const val MIN_WIDTH_FRACTION = 0.3
    private const val MIN_HEIGHT_FRACTION = 0.18
    private const val BORDER_MIN_FILL = 0.55
    private const val PEAK_REL_THRESHOLD = 0.32
    private const val MAX_PEAKS = 6
    private const val PEAK_MIN_SEP = 3
    // How far past a side its neighbours are followed, as a share of the frame,
    // and the fewest pixels worth judging (closer to the frame's edge than this,
    // the corner gate refuses the corner anyway).
    private const val PAST_FRACTION = 0.06
    private const val PAST_MIN_PX = 3
  }

  fun detect(luma: DocumentLuma): Bounds? {
    val w = luma.width
    val h = luma.height
    if (w < 8 || h < 8) return null
    val gx = FloatArray(w * h)
    val gy = FloatArray(w * h)
    sobel(luma.pixels, w, h, gx, gy)
    val r = findCardBounds(gx, gy, w, h) ?: return null
    return Bounds(
      left = (r[0] + 0.5) / w,
      top = (r[1] + 0.5) / h,
      right = (r[2] + 0.5) / w,
      bottom = (r[3] + 0.5) / h,
      score = r[4],
    )
  }

  private fun sobel(g: FloatArray, w: Int, h: Int, gx: FloatArray, gy: FloatArray) {
    for (y in 1 until h - 1) {
      for (x in 1 until w - 1) {
        val tl = g[(y - 1) * w + x - 1]; val tc = g[(y - 1) * w + x]; val tr = g[(y - 1) * w + x + 1]
        val ml = g[y * w + x - 1]; val mr = g[y * w + x + 1]
        val bl = g[(y + 1) * w + x - 1]; val bc = g[(y + 1) * w + x]; val br = g[(y + 1) * w + x + 1]
        gx[y * w + x] = abs(-tl - 2 * ml - bl + tr + 2 * mr + br)
        gy[y * w + x] = abs(-tl - 2 * tc - tr + bl + 2 * bc + br)
      }
    }
  }

  /** Mean + 0.6 standard deviations: a pixel above this is a "strong" border pixel. */
  private fun threshold(a: FloatArray): Double {
    var sum = 0.0
    var sq = 0.0
    for (v in a) { sum += v; sq += v.toDouble() * v }
    val mean = sum / a.size
    return mean + 0.6 * sqrt(maxOf(0.0, sq / a.size - mean * mean))
  }

  private fun smooth3(a: DoubleArray) {
    if (a.size < 3) return
    var prev = a[0]
    for (i in 1 until a.size - 1) {
      val cur = a[i]
      a[i] = (prev + cur + a[i + 1]) / 3
      prev = cur
    }
  }

  /** The strongest well-separated local maxima: candidate border lines, ascending. */
  internal fun findPeaks(proj: DoubleArray): List<Int> {
    val max = proj.maxOrNull() ?: return emptyList()
    if (max <= 0) return emptyList()
    val thresh = max * PEAK_REL_THRESHOLD
    val candidates = proj.indices.filter { i ->
      val v = proj[i]
      v >= thresh &&
        v >= (if (i > 0) proj[i - 1] else Double.NEGATIVE_INFINITY) &&
        v >= (if (i < proj.size - 1) proj[i + 1] else Double.NEGATIVE_INFINITY)
    }.sortedByDescending { proj[it] }
    val chosen = mutableListOf<Int>()
    for (c in candidates) {
      if (chosen.all { abs(it - c) >= PEAK_MIN_SEP }) {
        chosen.add(c)
        if (chosen.size >= MAX_PEAKS) break
      }
    }
    return chosen.sorted()
  }

  /** Share of row `r` (best of r-1..r+1) between left..right that is strong edge. */
  private fun rowFill(gy: FloatArray, r: Int, left: Int, right: Int, w: Int, h: Int, t: Double): Double {
    var best = 0.0
    for (rr in r - 1..r + 1) {
      if (rr < 0 || rr >= h) continue
      var count = 0
      for (x in left..right) if (gy[rr * w + x] > t) count++
      best = maxOf(best, count.toDouble() / (right - left + 1))
    }
    return best
  }

  /** Share of column `c` (best of c-1..c+1) between top..bottom that is strong edge. */
  private fun colFill(gx: FloatArray, c: Int, top: Int, bottom: Int, w: Int, t: Double): Double {
    var best = 0.0
    for (cc in c - 1..c + 1) {
      if (cc < 0 || cc >= w) continue
      var count = 0
      for (y in top..bottom) if (gx[y * w + cc] > t) count++
      best = maxOf(best, count.toDouble() / (bottom - top + 1))
    }
    return best
  }

  /** [left, top, right, bottom, score] in detection pixels, or null. */
  private fun findCardBounds(gx: FloatArray, gy: FloatArray, w: Int, h: Int): DoubleArray? {
    val vT = threshold(gx)
    val hT = threshold(gy)
    val rowProj = DoubleArray(h)
    val colProj = DoubleArray(w)
    for (y in 0 until h) {
      for (x in 0 until w) {
        rowProj[y] += gy[y * w + x].toDouble()
        colProj[x] += gx[y * w + x].toDouble()
      }
    }
    smooth3(rowProj)
    smooth3(colProj)
    val hPeaks = findPeaks(rowProj)
    val vPeaks = findPeaks(colProj)
    // One strong long side is enough for an upright slip (its top may be faint).
    if (hPeaks.size < 2 || vPeaks.isEmpty()) return null

    val turned = upright
    val minW = if (turned) MIN_HEIGHT_FRACTION else MIN_WIDTH_FRACTION
    val minH = if (turned) MIN_WIDTH_FRACTION else MIN_HEIGHT_FRACTION
    val ratioMin = if (turned) UPRIGHT_RATIO_MIN else RATIO_MIN
    val ratioMax = if (turned) UPRIGHT_RATIO_MAX else RATIO_MAX
    var best: DoubleArray? = null
    for (a in hPeaks.indices) for (b in a + 1 until hPeaks.size) {
      val top = hPeaks[a]; val bottom = hPeaks[b]
      val bh = bottom - top
      if (bh < minH * h) continue
      for (c in vPeaks.indices) for (d in c + 1 until vPeaks.size) {
        val left = vPeaks[c]; val right = vPeaks[d]
        val bw = right - left
        if (bw < minW * w) continue
        val ratio = bw.toDouble() / bh
        if (ratio < ratioMin || ratio > ratioMax) continue
        val areaFrac = (bw.toDouble() * bh) / (w * h)
        if (areaFrac < MIN_AREA_FRACTION || areaFrac > MAX_AREA_FRACTION) continue

        val tf = rowFill(gy, top, left, right, w, h, hT); if (tf < BORDER_MIN_FILL) continue
        val bf = rowFill(gy, bottom, left, right, w, h, hT); if (bf < BORDER_MIN_FILL) continue
        val lf = colFill(gx, left, top, bottom, w, vT); if (lf < BORDER_MIN_FILL) continue
        val rf = colFill(gx, right, top, bottom, w, vT); if (rf < BORDER_MIN_FILL) continue
        if (turned && paperRunsOn(gx, gy, left, top, right, bottom, w, h, hT, vT)) continue

        val minFill = minOf(minOf(tf, bf), minOf(lf, rf))
        val avgFill = (tf + bf + lf + rf) / 4
        // Prefer a well-centred candidate (it is under the guide) and a fuller one.
        val dist = hypot((left + right) / 2.0 / w - 0.5, (top + bottom) / 2.0 / h - 0.5)
        val score = minFill * 0.6 + avgFill * 0.25 + 0.15 * (1 - minOf(dist / 0.5, 1.0))
        if (best == null || score > best[4]) {
          best = doubleArrayOf(left.toDouble(), top.toDouble(), right.toDouble(), bottom.toDouble(), score)
        }
      }
    }
    if (best == null && turned) best = inferUprightBounds(gx, gy, w, h, hPeaks, vPeaks, hT, vT)
    return best
  }

  /**
   * An upright slip with one side too faint to be a peak: the top and bottom
   * (both strong) and one strong long side, with the other long side searched
   * for across the widths a slip of 1.9 to 2.45 can have. Only tried when no
   * four-sided candidate was found.
   */
  private fun inferUprightBounds(
    gx: FloatArray, gy: FloatArray, w: Int, h: Int,
    hPeaks: List<Int>, vPeaks: List<Int>, hT: Double, vT: Double,
  ): DoubleArray? {
    var best: DoubleArray? = null
    for (a in hPeaks.indices) for (b in a + 1 until hPeaks.size) {
      val top = hPeaks[a]; val bottom = hPeaks[b]
      val bh = bottom - top
      if (bh < MIN_WIDTH_FRACTION * h) continue
      for (side in vPeaks) {
        for (towardRight in listOf(true, false)) {
          val near = (bh * INFER_RATIO_MIN).toInt()
          val far = (bh * INFER_RATIO_MAX).toInt()
          // The paper's edge is the OUTERMOST faint line: a slip prints a border
          // just inside it, which is often the stronger of the two, and cropping
          // to that would cut off the slip's top.
          var weakAt = -1
          var weakFill = 0.0
          for (bw in near..far) {
            val c = if (towardRight) side + bw else side - bw
            if (c < 1 || c >= w - 1) continue
            val f = colFill(gx, c, top, bottom, w, vT)
            if (f >= WEAK_SIDE_MIN_FILL) weakAt = c
            weakFill = maxOf(weakFill, f)
          }
          if (weakAt < 0 || weakFill < WEAK_SIDE_MIN_FILL) continue
          val left = minOf(side, weakAt); val right = maxOf(side, weakAt)
          val bw = right - left
          if (bw < MIN_HEIGHT_FRACTION * w) continue
          val areaFrac = (bw.toDouble() * bh) / (w * h)
          if (areaFrac < MIN_AREA_FRACTION || areaFrac > MAX_AREA_FRACTION) continue
          val tf = rowFill(gy, top, left, right, w, h, hT); if (tf < BORDER_MIN_FILL) continue
          val bf = rowFill(gy, bottom, left, right, w, h, hT); if (bf < BORDER_MIN_FILL) continue
          val sf = colFill(gx, side, top, bottom, w, vT); if (sf < BORDER_MIN_FILL) continue
          // The real long side may be off the frame, with a column of print
          // standing in for it: then the top and bottom run on past it.
          if (paperRunsOn(gx, gy, left, top, right, bottom, w, h, hT, vT)) continue
          val minFill = minOf(minOf(tf, bf), minOf(sf, weakFill))
          val avgFill = (tf + bf + sf + weakFill) / 4
          val dist = hypot((left + right) / 2.0 / w - 0.5, (top + bottom) / 2.0 / h - 0.5)
          val score = minFill * 0.6 + avgFill * 0.25 + 0.15 * (1 - minOf(dist / 0.5, 1.0))
          if (best == null || score > best[4]) {
            best = doubleArrayOf(left.toDouble(), top.toDouble(), right.toDouble(), bottom.toDouble(), score)
          }
        }
      }
    }
    return best
  }

  /**
   * True when the paper carries on past one of the box's sides: the two edges
   * that meet that side both keep going beyond it. A document's edges stop at
   * its corners, so such a box is something printed on a document that runs
   * out of the picture (a column of print, the slip's inner border, a row of
   * its table), and its corners say nothing about the document's.
   *
   * A side too near the frame's edge to look past is left to the corner gate,
   * which refuses a corner there anyway.
   */
  internal fun paperRunsOn(
    gx: FloatArray, gy: FloatArray,
    left: Int, top: Int, right: Int, bottom: Int,
    w: Int, h: Int, hT: Double, vT: Double,
  ): Boolean {
    val reachX = maxOf(PAST_MIN_PX, Math.round(w * PAST_FRACTION).toInt())
    val reachY = maxOf(PAST_MIN_PX, Math.round(h * PAST_FRACTION).toInt())
    // Two pixels clear of the side, so its own blur is not counted.
    fun pastRows(from: Int, to: Int): Boolean =
      to - from + 1 >= PAST_MIN_PX &&
        rowFill(gy, top, from, to, w, h, hT) >= BORDER_MIN_FILL &&
        rowFill(gy, bottom, from, to, w, h, hT) >= BORDER_MIN_FILL
    fun pastCols(from: Int, to: Int): Boolean =
      to - from + 1 >= PAST_MIN_PX &&
        colFill(gx, left, from, to, w, vT) >= BORDER_MIN_FILL &&
        colFill(gx, right, from, to, w, vT) >= BORDER_MIN_FILL
    return pastRows(maxOf(0, left - 2 - reachX), left - 2) ||
      pastRows(right + 2, minOf(w - 1, right + 2 + reachX)) ||
      pastCols(maxOf(0, top - 2 - reachY), top - 2) ||
      pastCols(bottom + 2, minOf(h - 1, bottom + 2 + reachY))
  }
}
