package ru.vtoroygolos.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * «Второй голос» для Android: показывает программу из файлов внутри приложения.
 * Файлы отдаются по адресу https://appassets.androidplatform.net/ — это защищённый адрес,
 * поэтому в WebView работают микрофон и хранилище, а интернет не нужен.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_MIC = 1;
    private static final int REQ_FILE = 2;

    private WebView web;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Во время занятия экран не гаснет.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#5A3DD8"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUserAgentString(s.getUserAgentString() + " VtoroyGolosApp/1.0");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) return null;
                return asset(url.getPath());
            }

            // Вариант со строкой Android вызывает на всех версиях (API 21+).
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String link) {
                Uri url = Uri.parse(link);
                if (HOST.equals(url.getHost())) return false;
                // Внешние ссылки открываются в браузере.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException e) {
                    // некуда открыть — просто остаёмся в программе
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        handlePermission(request);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"audio/*", "video/mp4", "application/ogg"});
                try {
                    startActivityForResult(Intent.createChooser(pick, "Запись для разбора"), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
    }

    private void handlePermission(PermissionRequest request) {
        boolean wantsMic = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
        }
        if (!wantsMic) {
            request.deny();
            return;
        }
        if (Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            if (pendingPermission != null) pendingPermission.deny();
            pendingPermission = request;
            requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code == REQ_MIC && pendingPermission != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingPermission.deny();
            }
            pendingPermission = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] uris = null;
                if (result == RESULT_OK && data != null && data.getData() != null) uris = new Uri[] {data.getData()};
                fileCallback.onReceiveValue(uris);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(code, result, data);
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
        String mime = mimeOf(path);
        boolean text = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json");
        try {
            InputStream in = getAssets().open("www" + path);
            WebResourceResponse r = new WebResourceResponse(mime, text ? "UTF-8" : null, in);
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8", null);
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
