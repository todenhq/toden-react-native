import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import NitroModules
import UniformTypeIdentifiers
import VisionCamera

// ---------------------------------------------------------------------------
// HybridMyazaDepthFrame: the iPhone depth frame (src/specs/MyazaDepthFrame
// .nitro.ts, Core: docbio/depth-sensor.ts).
//
// The selfie's still is taken with depth on the front TrueDepth (Face ID)
// camera, and AVFoundation embeds the depth map in the photo file as auxiliary
// data. Reading it back from the file, rather than from the in-memory photo,
// keeps VisionCamera's capture path exactly as it is: the SDK still captures
// straight to a file.
//
// The photo output is VisionCamera's own; it is reached through VisionCamera's
// public `NativeCameraOutput` protocol, as the face detector reaches a frame's
// buffer through `NativeFrame`. Nothing here starts, stops or reconfigures the
// session itself.
// ---------------------------------------------------------------------------

final class HybridMyazaDepthFrame: HybridMyazaDepthFrameSpec {
  func enablePhotoDepth(output: any HybridCameraPhotoOutputSpec) throws -> Bool {
    guard let photoOutput = Self.photoOutput(of: output) else { return false }
    // Setting the switch where depth is unsupported raises an Objective-C
    // exception, so support is asked first. It is false on a camera without
    // a depth sensor, and until the output is connected to a running session.
    guard photoOutput.isDepthDataDeliverySupported else { return false }
    if !photoOutput.isDepthDataDeliveryEnabled {
      photoOutput.isDepthDataDeliveryEnabled = true
    }
    return photoOutput.isDepthDataDeliveryEnabled
  }

  func photoDepthReady(output: any HybridCameraPhotoOutputSpec) throws -> Bool {
    guard let photoOutput = Self.photoOutput(of: output) else { return false }
    return photoOutput.isDepthDataDeliverySupported && photoOutput.isDepthDataDeliveryEnabled
  }

  func depthPngFromPhoto(photoPath: String) throws -> Promise<String> {
    return Promise.async(.utility) {
      Self.writeDepthPng(fromPhotoAt: photoPath) ?? ""
    }
  }

  private static func photoOutput(of output: any HybridCameraPhotoOutputSpec) -> AVCapturePhotoOutput? {
    guard let native = output as? any NativeCameraOutput else { return nil }
    return native.output as? AVCapturePhotoOutput
  }

  /// Core reads millimetres from a sensor that measures to about one, so
  /// anything coarser or relative would be a different measurement.
  private static func writeDepthPng(fromPhotoAt path: String) -> String? {
    let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
    guard let url, let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    guard var depth = embeddedDepth(in: source) else { return nil }
    // A relative map (two lenses' disparity) is not distances; Core would
    // read its shape as millimetres and be wrong. TrueDepth maps are absolute.
    guard depth.depthDataAccuracy == .absolute else { return nil }
    // Upright and mirrored like the photo, so the frame lines up with the
    // selfie it was taken with.
    if let orientation = exifOrientation(of: source) {
      depth = depth.applyingExifOrientation(orientation)
    }
    if depth.depthDataType != kCVPixelFormatType_DepthFloat32 {
      depth = depth.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
    }
    guard let millimetres = millimetreImage(of: depth.depthDataMap) else { return nil }
    return writePng(millimetres)
  }

  private static func embeddedDepth(in source: CGImageSource) -> AVDepthData? {
    // A capture embeds depth or disparity, depending on the camera; either
    // converts to depth below.
    for type in [kCGImageAuxiliaryDataTypeDepth, kCGImageAuxiliaryDataTypeDisparity] {
      guard
        let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, type) as? [AnyHashable: Any],
        let depth = try? AVDepthData(fromDictionaryRepresentation: info)
      else { continue }
      return depth
    }
    return nil
  }

  private static func exifOrientation(of source: CGImageSource) -> CGImagePropertyOrientation? {
    guard
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let raw = properties[kCGImagePropertyOrientation] as? UInt32
    else { return nil }
    return CGImagePropertyOrientation(rawValue: raw)
  }

  /// The map as a 16-bit greyscale image, big-endian as PNG stores it: each
  /// value the distance in millimetres, 0 where the sensor had no reading.
  private static func millimetreImage(of map: CVPixelBuffer) -> CGImage? {
    guard CVPixelBufferGetPixelFormatType(map) == kCVPixelFormatType_DepthFloat32 else { return nil }
    CVPixelBufferLockBaseAddress(map, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
    let width = CVPixelBufferGetWidth(map)
    let height = CVPixelBufferGetHeight(map)
    let sourceStride = CVPixelBufferGetBytesPerRow(map)
    guard width > 0, height > 0 else { return nil }

    var bytes = Data(count: width * height * 2)
    bytes.withUnsafeMutableBytes { raw in
      let out = raw.bindMemory(to: UInt16.self)
      for y in 0..<height {
        let row = (base + y * sourceStride).assumingMemoryBound(to: Float32.self)
        for x in 0..<width {
          let metres = row[x]
          // NaN, infinity and nothing-there are all "no reading".
          var mm: UInt16 = 0
          if metres.isFinite && metres > 0 {
            let value = (metres * 1000).rounded()
            if value < Float32(UInt16.max) { mm = UInt16(value) }
          }
          out[y * width + x] = mm.bigEndian
        }
      }
    }

    guard let provider = CGDataProvider(data: bytes as CFData) else { return nil }
    // Device grey keeps every value as it is (checked: a written and re-read
    // PNG gives back the same numbers, colour type 0, bit depth 16).
    return CGImage(
      width: width,
      height: height,
      bitsPerComponent: 16,
      bitsPerPixel: 16,
      bytesPerRow: width * 2,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue | CGBitmapInfo.byteOrder16Big.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: false,
      intent: .defaultIntent)
  }

  private static func writePng(_ image: CGImage) -> String? {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("toden-depth-\(UUID().uuidString)")
      .appendingPathExtension("png")
    guard
      let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return url.absoluteString
  }
}
