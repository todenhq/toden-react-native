package com.margelo.nitro.myazakyc

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * The presence device's P-256 key in the Android Keystore (user token design
 * rev 4, section 14): StrongBox when the phone has it, else the TEE. The
 * private key never leaves the Keystore and cannot be exported. No user
 * authentication and no unlocked-device requirement, so the headless flush
 * can sign while the phone sits locked. The Flutter SDK's PresenceDeviceKey.kt
 * does the same; the alias is chosen by TypeScript (src/presence/device.ts).
 *
 * Below Android 6 there is no Keystore EC key: [create] answers null and
 * presence runs as before, with no refresh and no seals.
 */
object PresenceDeviceKey {
  private const val KEYSTORE = "AndroidKeyStore"
  /** Where each key was made. Not a secret; never the key. */
  private const val PREFS = "toden_presence_device_keys"

  data class Created(val publicKey: String, val keyStorage: String)

  fun create(context: Context?, alias: String): Created? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
    delete(context, alias)
    val made = makeKey(alias)
    if (made != null) context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.putString(alias, made.keyStorage)?.apply()
    return made
  }

  private fun makeKey(alias: String): Created? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        return generate(alias, strongBox = true)
      } catch (_: StrongBoxUnavailableException) {
        // No StrongBox on this phone: the TEE below.
      } catch (_: Exception) {
        deleteEntry(alias)
      }
    }
    return try {
      generate(alias, strongBox = false)
    } catch (_: Exception) {
      deleteEntry(alias)
      null
    }
  }

  private fun generate(alias: String, strongBox: Boolean): Created {
    val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setUserAuthenticationRequired(false)
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setIsStrongBoxBacked(true)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    generator.initialize(builder.build())
    val pair = generator.generateKeyPair()
    // X.509 SubjectPublicKeyInfo, DER: what core reads.
    return Created(Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP), if (strongBox) "strongbox" else "tee")
  }

  /** ECDSA-SHA256 over [text], base64 DER, or null when the key is gone. */
  fun sign(alias: String, text: String): String? = try {
    val key = KeyStore.getInstance(KEYSTORE).apply { load(null) }.getKey(alias, null) as? PrivateKey
    if (key == null) {
      null
    } else {
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(key)
      signer.update(text.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
    }
  } catch (_: Exception) {
    null
  }

  fun storage(context: Context?, alias: String): String {
    val exists = try {
      KeyStore.getInstance(KEYSTORE).apply { load(null) }.containsAlias(alias)
    } catch (_: Exception) {
      false
    }
    if (!exists) return ""
    return context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.getString(alias, null) ?: "tee"
  }

  fun delete(context: Context?, alias: String) {
    deleteEntry(alias)
    context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.remove(alias)?.apply()
  }

  private fun deleteEntry(alias: String) {
    try {
      KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(alias)
    } catch (_: Exception) {
      // Nothing to delete.
    }
  }
}
