package PACKAGE_PLACEHOLDER;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * Launcher icon by currency. The manifest has one activity-alias per icon (".Icon" + key, e.g. ".IconUSD"),
 * all pointing at MainActivity, with only ".IconUSD" enabled by default (see apply-currency-icons.py).
 *
 * setIcon({name, all}) remembers the wanted icon and switches it when the app goes to the background:
 * swapping the enabled launcher alias while the app is on screen can close it on some phones.
 * Resolves {changed} - false if that icon is already the one shown.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    private static final String PREFS = "app_icon";
    private static final String DEFAULT = "USD";
    private String pending = null;
    private List<String> all = new ArrayList<>();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void getIcon(PluginCall call) {
        JSObject o = new JSObject();
        o.put("name", prefs().getString("current", DEFAULT));
        call.resolve(o);
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        String name = call.getString("name");
        JSArray list = call.getArray("all");
        if (name == null || list == null) { call.reject("error", "bad args"); return; }
        List<String> keys = new ArrayList<>();
        try {
            for (int i = 0; i < list.length(); i++) keys.add(list.getString(i));
        } catch (JSONException e) { call.reject("error", "bad list"); return; }
        if (!keys.contains(name)) { call.reject("error", "unknown icon"); return; }
        all = keys;
        boolean changed = !name.equals(prefs().getString("current", DEFAULT));
        pending = changed ? name : null;
        JSObject o = new JSObject();
        o.put("changed", changed);
        call.resolve(o);
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        if (pending != null) apply(pending);
    }

    private void apply(String name) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();
        try {
            // קודם מפעילים את החדש ורק אז מכבים את האחרים, שלא יהיה רגע בלי אייקון במסך הבית
            pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".Icon" + name),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String key : all) {
                if (key.equals(name)) continue;
                pm.setComponentEnabledSetting(new ComponentName(pkg, pkg + ".Icon" + key),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            prefs().edit().putString("current", name).apply();
            pending = null;
        } catch (Exception e) {
            // alias שלא קיים בגרסה הזו - משאירים את האייקון הנוכחי
            pending = null;
        }
    }
}
