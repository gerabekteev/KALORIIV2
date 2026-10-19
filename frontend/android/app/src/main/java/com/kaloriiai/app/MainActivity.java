package com.kaloriiai.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int WEBRTC_PERMISSION_REQUEST_CODE = 9001;
    private PermissionRequest pendingWebRtcRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            // Убираем белую вспышку при старте WebView
            webView.setBackgroundColor(Color.parseColor("#0F0F0F"));

            // Перехватываем запросы WebRTC (getUserMedia для камеры сканера и микрофона Голос AI)
            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> handleWebRtcPermissionRequest(request));
                }
            });
        }
    }

    private void handleWebRtcPermissionRequest(final PermissionRequest request) {
        List<String> neededOsPermissions = new ArrayList<>();

        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    neededOsPermissions.add(Manifest.permission.CAMERA);
                }
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    neededOsPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            }
        }

        if (neededOsPermissions.isEmpty()) {
            request.grant(request.getResources());
        } else {
            if (pendingWebRtcRequest != null) {
                try {
                    pendingWebRtcRequest.deny();
                } catch (Exception ignored) {}
            }
            pendingWebRtcRequest = request;
            ActivityCompat.requestPermissions(
                    this,
                    neededOsPermissions.toArray(new String[0]),
                    WEBRTC_PERMISSION_REQUEST_CODE
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == WEBRTC_PERMISSION_REQUEST_CODE && pendingWebRtcRequest != null) {
            boolean allGranted = grantResults.length > 0;
            for (int res : grantResults) {
                if (res != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            try {
                if (allGranted) {
                    pendingWebRtcRequest.grant(pendingWebRtcRequest.getResources());
                } else {
                    pendingWebRtcRequest.deny();
                }
            } catch (Exception ignored) {
            } finally {
                pendingWebRtcRequest = null;
            }
        }
    }
}
