package com.jruan.studyos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StudyDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
