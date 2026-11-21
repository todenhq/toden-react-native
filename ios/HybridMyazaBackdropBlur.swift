import NitroModules
import UIKit

// The blur around the face window of the full-screen liveness camera
// (src/specs/MyazaBackdropBlur.nitro.ts).
//
// A UIVisualEffectView blurs whatever is behind it, the camera preview
// included, every frame and on the GPU. The window is cut out of it with a
// MASK VIEW set on the effect view itself: that is the one way to shape a
// visual effect view. A mask on its layer, or on any view above it, switches
// the blur off.

final class HybridMyazaBackdropBlur: HybridMyazaBackdropBlurSpec {
  private let blur = BackdropBlurView()
  var view: UIView { blur }

  var windowX: Double = 0
  var windowY: Double = 0
  var windowWidth: Double = 0
  var windowHeight: Double = 0
  var dark: Bool = false

  // Props arrive as one batch; the view is told once, on the main thread.
  func afterUpdate() {
    let window = CGRect(x: windowX, y: windowY, width: windowWidth, height: windowHeight)
    let dark = self.dark
    let blur = self.blur
    if Thread.isMainThread {
      blur.update(window: window, dark: dark)
    } else {
      DispatchQueue.main.async { blur.update(window: window, dark: dark) }
    }
  }
}

/// How much of the material's full blur is used. A system material has no
/// radius setting, so its strength is set the way expo-blur's `intensity` is:
/// the effect is applied by a property animator paused part of the way, and the
/// effect view draws that share of it. The web blurs 2px round the window
/// (LIVENESS_BLUR in src/lib/livenessCutout.ts): softened, not frosted (user,
/// 2026-11-17). The full ultra-thin material read as frosted glass, so a small
/// share of it is the match; confirm by eye on a device beside the web.
let BACKDROP_BLUR_FRACTION: CGFloat = 0.12

final class BackdropBlurView: UIView {
  private let effectView = UIVisualEffectView(effect: nil)
  private var hole: CGRect = .zero
  private var dark: Bool?
  /// Holds the effect part of the way. Left running when the view goes, a
  /// paused animator raises, so it is always stopped before it is let go.
  private var animator: UIViewPropertyAnimator?
  private var foreground: NSObjectProtocol?

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    addSubview(effectView)
    // Coming back to the app can run a paused animator to its end, which would
    // leave the full material on screen: set it again.
    foreground = NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.applyEffect() }
  }

  required init?(coder: NSCoder) { nil }

  deinit {
    animator?.stopAnimation(true)
    if let foreground { NotificationCenter.default.removeObserver(foreground) }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // A view taken off screen and back can lose its paused state too.
    if window != nil { applyEffect() }
  }

  func update(window: CGRect, dark: Bool) {
    let themeChanged = self.dark != dark
    self.dark = dark
    if hole != window {
      hole = window
      applyMask()
      // A new mask rebuilds the effect view from its MODEL effect, which the
      // paused animator has already set to the full material: the weak blur
      // is lost (seen on an iPhone, iOS 27.2, 2026-11-18, as the full frosted
      // material). So the effect is set again after every mask.
      applyEffect()
    } else if themeChanged {
      applyEffect()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if effectView.frame != bounds {
      effectView.frame = bounds
      applyMask()
      applyEffect()
    }
  }

  /// The thinnest material, light or dark as the flow is (its theme is not
  /// always the phone's), held at BACKDROP_BLUR_FRACTION of its strength. The
  /// flow lays its own tint over it.
  private func applyEffect() {
    guard let dark else { return }
    animator?.stopAnimation(true)
    effectView.effect = nil
    let effect = UIBlurEffect(style: dark ? .systemUltraThinMaterialDark : .systemUltraThinMaterialLight)
    let held = UIViewPropertyAnimator(duration: 1, curve: .linear) { [weak effectView] in
      effectView?.effect = effect
    }
    held.pausesOnCompletion = true
    held.fractionComplete = BACKDROP_BLUR_FRACTION
    animator = held
  }

  /// Everything but the window. Built fresh each time: the effect view takes
  /// its own copy of the mask, so changing the old one's shape does nothing.
  private func applyMask() {
    guard bounds.width > 0, bounds.height > 0 else { return }
    let path = UIBezierPath(rect: bounds)
    let window = hole
    if window.width > 0, window.height >= window.width {
      // Round ends drawn as arcs: a rounded rect whose radius is half its
      // width does not come out as a true half circle.
      let r = window.width / 2
      let cut = UIBezierPath()
      cut.move(to: CGPoint(x: window.minX, y: window.minY + r))
      cut.addArc(
        withCenter: CGPoint(x: window.midX, y: window.minY + r), radius: r,
        startAngle: .pi, endAngle: 0, clockwise: true)
      cut.addLine(to: CGPoint(x: window.maxX, y: window.maxY - r))
      cut.addArc(
        withCenter: CGPoint(x: window.midX, y: window.maxY - r), radius: r,
        startAngle: 0, endAngle: .pi, clockwise: true)
      cut.close()
      path.append(cut)
    }
    let shape = CAShapeLayer()
    shape.frame = bounds
    shape.fillRule = .evenOdd
    shape.fillColor = UIColor.black.cgColor
    shape.path = path.cgPath
    let mask = UIView(frame: bounds)
    mask.backgroundColor = .clear
    mask.layer.addSublayer(shape)
    effectView.mask = mask
  }
}
