package app.tradinganis;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdatePlugin.class); // ⬆️ the update banner's Update button
        registerPlugin(WidgetPlugin.class); // 📱 "Portfolio today" home-screen widget
        super.onCreate(savedInstanceState);
    }
}
