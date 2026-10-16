package app.tradinganis;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * 📱 "Portfolio today" home-screen widget: what your stocks are worth, today's change ($ and %, with ▲/▼ words, not
 * colour alone) and the biggest mover. The app sends the numbers (WidgetPlugin) each time it loads prices. Tap = open the app.
 * Information only: the app never places orders.
 */
public class PortfolioWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PortfolioWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    static RemoteViews views(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_portfolio);
        String value = p.getString("value", "");
        if (value.isEmpty()) {
            v.setTextViewText(R.id.w_value, "–");
            v.setTextViewText(R.id.w_change, "Open the app once");
            v.setTextColor(R.id.w_change, 0xCCFFFFFF);
            v.setTextViewText(R.id.w_mover, "to show your portfolio here");
            v.setTextViewText(R.id.w_at, "");
        } else {
            v.setTextViewText(R.id.w_value, value);
            v.setTextViewText(R.id.w_change, p.getString("change", ""));
            v.setTextColor(R.id.w_change, p.getBoolean("up", true) ? 0xFF6EE7B7 : 0xFFFCA5A5);
            v.setTextViewText(R.id.w_mover, p.getString("mover", ""));
            v.setTextViewText(R.id.w_at, p.getString("at", ""));
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_root, pi);
        return v;
    }
}
