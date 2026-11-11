package PACKAGE_PLACEHOLDER;

import android.os.CancellationSignal;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executors;

// התחברות עם גוגל באפליקציה (בתוך WebView גוגל חוסמת את החלון הקופץ של האתר).
// Credential Manager של אנדרואיד מציג את בחירת החשבון ומחזיר Google ID token. ה-JS מחליף אותו
// ב-Firebase ID token (signInWithCredential), כך שהשרת מאמת בדיוק כמו באתר (convex/googleAuth.ts).
// google_web_client_id: מזהה לקוח הווב של פרויקט Firebase, נכתב בבנייה מ-google-services.json (build-apk.yml).
@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        int res = getContext().getResources().getIdentifier("google_web_client_id", "string", getContext().getPackageName());
        String clientId = res == 0 ? "" : getContext().getString(res);
        if (clientId.isEmpty()) {
            call.reject("google_web_client_id missing", "NO_CLIENT_ID");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(getActivity(), request, new CancellationSignal(), Executors.newSingleThreadExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential c = response.getCredential();
                    if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                        try {
                            GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData());
                            JSObject out = new JSObject();
                            out.put("idToken", g.getIdToken());
                            call.resolve(out);
                        } catch (Exception e) {
                            call.reject("bad credential", "FAILED", e);
                        }
                    } else {
                        call.reject("unexpected credential", "FAILED");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (e instanceof GetCredentialCancellationException) call.reject("cancelled", "CANCELLED");
                    else if (e instanceof NoCredentialException) call.reject("no account", "NO_ACCOUNT");
                    else call.reject(String.valueOf(e.getMessage()), "FAILED");
                }
            });
    }
}
