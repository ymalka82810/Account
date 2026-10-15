package PACKAGE_PLACEHOLDER;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
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
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

/**
 * Fingerprint / face confirmation that the server can verify.
 *
 * register({alias}) creates a P-256 key in the Android Keystore that can only be used after a strong
 * biometric check, and returns its public key (X.509 SPKI, base64). sign({alias, message, title, subtitle})
 * shows BiometricPrompt and signs the UTF-8 message with SHA256withECDSA (DER signature, base64).
 * The server keeps the public key and checks each signature, so a role change can't skip the prompt.
 *
 * Rejects with "cancel", "nokey", "invalidated" (a new fingerprint was enrolled; register again),
 * "unavailable" or "error".
 *
 * Needs androidx.biometric in app/build.gradle and registerPlugin(BiometricAuthPlugin.class) in MainActivity.
 */
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {
    private static final String STORE = "AndroidKeyStore";
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG;

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
            KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= 30) {
                b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            } else {
                b.setUserAuthenticationValidityDurationSeconds(-1); // כל שימוש דורש אימות ביומטרי
            }
            KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE);
            g.initialize(b.build());
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
        final Signature sig;
        try {
            KeyStore ks = KeyStore.getInstance(STORE);
            ks.load(null);
            PrivateKey key = (PrivateKey) ks.getKey(alias, null);
            if (key == null) { call.reject("nokey"); return; }
            sig = Signature.getInstance("SHA256withECDSA");
            sig.initSign(key);
        } catch (KeyPermanentlyInvalidatedException e) {
            deleteQuietly(alias);
            call.reject("invalidated");
            return;
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
                            BiometricPrompt.CryptoObject co = result.getCryptoObject();
                            Signature s = co != null ? co.getSignature() : null;
                            if (s == null) { call.reject("error", "no signature"); return; }
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
                    // onAuthenticationFailed (אצבע לא מזוהה) - החלון נשאר פתוח לניסיון נוסף.
                });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("ביטול")
                .setAllowedAuthenticators(AUTH)
                .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(sig));
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
