import Foundation
import Security

// ---------------------------------------------------------------------------
// The presence device's P-256 key in the Secure Enclave (user token design
// rev 4, section 14). Permanent, AfterFirstUnlockThisDeviceOnly with
// .privateKeyUsage and no biometry or passcode flag, so the headless flush can
// sign while the phone is locked after its first unlock. The private key
// cannot leave the Enclave. With no Secure Enclave (a simulator) there is no
// key and presence runs as before. The Flutter SDK's PresenceDeviceKey.swift
// does the same; the alias is chosen by TypeScript (src/presence/device.ts).
// ---------------------------------------------------------------------------

enum PresenceDeviceKey {
  /// The DER prefix that turns a 65-byte X9.63 P-256 point into an SPKI.
  private static let spkiPrefix: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]

  private static func tag(_ alias: String) -> Data { Data(alias.utf8) }

  /// The public key as base64 DER SPKI, or nil.
  static func create(alias: String) -> String? {
    delete(alias: alias)
    guard
      let access = SecAccessControlCreateWithFlags(
        nil, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, .privateKeyUsage, nil)
    else { return nil }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: tag(alias),
        kSecAttrAccessControl as String: access,
      ] as [String: Any],
    ]
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil),
          let pub = SecKeyCopyPublicKey(key),
          let point = SecKeyCopyExternalRepresentation(pub, nil) as Data?,
          point.count == 65
    else {
      delete(alias: alias)
      return nil
    }
    return (Data(spkiPrefix) + point).base64EncodedString()
  }

  private static func find(alias: String) -> SecKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag(alias),
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let found = item else { return nil }
    return (found as! SecKey)
  }

  /// ECDSA-SHA256 over the UTF-8 bytes of `text`, base64 DER (X9.62), or nil.
  static func sign(alias: String, text: String) -> String? {
    guard let key = find(alias: alias),
          let signature = SecKeyCreateSignature(
            key, .ecdsaSignatureMessageX962SHA256, Data(text.utf8) as CFData, nil) as Data?
    else { return nil }
    return signature.base64EncodedString()
  }

  static func exists(alias: String) -> Bool { find(alias: alias) != nil }

  static func delete(alias: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag(alias),
    ]
    SecItemDelete(query as CFDictionary)
  }
}
