package PACKAGE_PLACEHOLDER;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

/**
 * Fingerprint / face confirmation that the server can verify.
 *
 * Face unlock on most Android phones is a "weak" (class 2) biometric, and Android lets only "strong"
 * biometrics unlock a Keystore key. So the prompt allows BIOMETRIC_WEAK (face or fingerprint, whichever
 * the phone has), and only after it succeeds the app signs with a non-exportable Keystore key that never
 * leaves this app. register({alias}) returns the public key (X.509 SPKI, base64);
 * sign({alias, message, title, subtitle}) shows the prompt and returns a SHA256withECDSA signature (DER, base64).
 *
 * Rejects with "cancel", "nokey", "invalidated" (an older key from the fingerprint-only version; register again),
 * "unavailable" or "error".
 *
 * Needs androidx.biometric in app/build.gradle and registerPlugin(BiometricAuthPlugin.class) in MainActivity.
 */
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {
    private static final String STORE = "AndroidKeyStore";
    // WEAK כולל גם את החזקים: זיהוי פנים וגם טביעת אצבע.
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTH);
        JSObject o = new JSObject();
        o.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        o.put("code", r);
        call.resolve(o);
    }

    @PluginMethod
    public void register(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null || alias.isEmpty()) { call.reject("error", "bad alias"); return; }
        if (BiometricManager.from(getContext()).canAuthenticate(AUTH) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("unavailable");
            return;
        }
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            if (ks.containsAlias(alias)) ks.deleteEntry(alias);
            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build();
            KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE);
            g.initialize(spec);
            KeyPair kp = g.generateKeyPair();
            JSObject o = new JSObject();
            o.put("publicKey", Base64.encodeToString(kp.getPublic().getEncoded(), Base64.NO_WRAP));
            call.resolve(o);
        } catch (Exception e) {
            call.reject("error", e);
        }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        final String alias = call.getString("alias");
        final String message = call.getString("message");
        final String title = call.getString("title", "אימות");
        final String subtitle = call.getString("subtitle", "");
        if (alias == null || message == null) { call.reject("error", "bad args"); return; }
        final PrivateKey key;
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            key = (PrivateKey) ks.getKey(alias, null);
            if (key == null) { call.reject("nokey"); return; }
            // מפתח מהגרסה הקודמת (רק טביעת אצבע): נרשמים מחדש כדי לאפשר גם זיהוי פנים.
            KeyFactory kf = KeyFactory.getInstance(key.getAlgorithm(), STORE);
            KeyInfo info = kf.getKeySpec(key, KeyInfo.class);
            if (info.isUserAuthenticationRequired()) {
                deleteQuietly(alias);
                call.reject("invalidated");
                return;
            }
        } catch (Exception e) {
            call.reject("error", e);
            return;
        }

        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                (FragmentActivity) getActivity(),
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        try {
                            Signature s = Signature.getInstance("SHA256withECDSA");
                            s.initSign(key);
                            s.update(message.getBytes(StandardCharsets.UTF_8));
                            JSObject o = new JSObject();
                            o.put("signature", Base64.encodeToString(s.sign(), Base64.NO_WRAP));
                            call.resolve(o);
                        } catch (Exception e) {
                            call.reject("error", e);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence msg) {
                        boolean cancel = code == BiometricPrompt.ERROR_USER_CANCELED
                            || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || code == BiometricPrompt.ERROR_CANCELED;
                        call.reject(cancel ? "cancel" : "error", String.valueOf(code));
                    }
                    // onAuthenticationFailed (פנים/אצבע לא מזוהים) - החלון נשאר פתוח לניסיון נוסף.
                });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("ביטול")
                .setAllowedAuthenticators(AUTH)
                .setConfirmationRequired(false) // זיהוי פנים מאשר מיד, בלי לחיצה נוספת
                .build();
            prompt.authenticate(info);
        });
    }

    private void deleteQuietly(String alias) {
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            ks.deleteEntry(alias);
        } catch (Exception ignored) {
        }
    }
}
