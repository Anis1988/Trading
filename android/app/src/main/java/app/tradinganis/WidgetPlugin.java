package app.tradinganis;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives "Portfolio today" from the app (already in words) each time it loads prices, and refreshes the widget. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    static final String PREFS = "ta_widget";
    static final String[] KEYS = { "value", "change", "mover", "at" };

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (String k : KEYS) e.putString(k, call.getString(k, ""));
        e.putBoolean("up", call.getBoolean("up", true));
        e.apply();
        PortfolioWidget.updateAll(ctx);
        call.resolve();
    }
}
