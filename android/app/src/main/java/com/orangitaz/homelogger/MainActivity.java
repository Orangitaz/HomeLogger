package com.orangitaz.homelogger;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * HomeLogger Android shell. The whole UI is the same web app the TrueNAS server serves
 * (bundled into assets/), running standalone: data lives in the WebView's IndexedDB.
 * This class only adds what a WebView cannot do alone: file picking with a camera option,
 * and opening/saving files through the "AndroidBridge" JavaScript interface.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private File cameraFile;
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraFile = null;
                cameraUri = null;

                Intent chooser = new Intent(Intent.ACTION_CHOOSER);
                chooser.putExtra(Intent.EXTRA_INTENT, params.createIntent());
                chooser.putExtra(Intent.EXTRA_TITLE, "Choose a file");

                try {
                    File dir = new File(getCacheDir(), "camera");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    cameraFile = File.createTempFile("photo_", ".jpg", dir);
                    cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", cameraFile);
                    Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    List<ResolveInfo> apps = getPackageManager().queryIntentActivities(cam, PackageManager.MATCH_DEFAULT_ONLY);
                    for (ResolveInfo ri : apps) {
                        grantUriPermission(ri.activityInfo.packageName, cameraUri,
                                Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                    if (!apps.isEmpty()) {
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                    }
                } catch (Exception e) {
                    cameraFile = null;
                    cameraUri = null;
                }

                try {
                    startActivityForResult(chooser, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && (data.getData() != null || data.getClipData() != null)) {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            } else if (cameraFile != null && cameraUri != null && cameraFile.length() > 0) {
                result = new Uri[]{cameraUri};
            }
        }
        if (fileCallback != null) {
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__back ? window.__back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    /** JavaScript interface used by the web app to hand files to Android. */
    public class Bridge {
        private OutputStream out;
        private File tmp;
        private Uri savedUri;
        private String name, mime, action;

        @JavascriptInterface
        public synchronized void beginSave(String fileName, String mimeType, String act) {
            closeQuietly();
            name = safeName(fileName);
            mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
            action = act;
            tmp = null;
            savedUri = null;
            try {
                if ("download".equals(act)) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    ContentResolver r = getContentResolver();
                    savedUri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    out = r.openOutputStream(savedUri);
                } else {
                    File dir = new File(getCacheDir(), "share");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    tmp = new File(dir, name);
                    out = new FileOutputStream(tmp);
                }
            } catch (Exception e) {
                out = null;
                toast("Could not save file");
            }
        }

        @JavascriptInterface
        public synchronized void writeText(String text) {
            write(text == null ? new byte[0] : text.getBytes(StandardCharsets.UTF_8));
        }

        @JavascriptInterface
        public synchronized void writeB64(String b64) {
            write(Base64.decode(b64, Base64.DEFAULT));
        }

        @JavascriptInterface
        public synchronized void endSave() {
            if (out == null) return;
            closeQuietly();
            try {
                if ("download".equals(action) && savedUri != null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(savedUri, v, null, null);
                    toast("Saved to Downloads: " + name);
                } else if (tmp != null) {
                    final Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", tmp);
                    final Intent view = new Intent(Intent.ACTION_VIEW);
                    view.setDataAndType(uri, mime);
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                startActivity(Intent.createChooser(view, "Open with"));
                            } catch (Exception e) {
                                Toast.makeText(MainActivity.this, "No app can open this file", Toast.LENGTH_LONG).show();
                            }
                        }
                    });
                }
            } catch (Exception e) {
                toast("Could not open file");
            }
        }

        private void write(byte[] bytes) {
            if (out == null) return;
            try {
                out.write(bytes);
            } catch (Exception e) {
                closeQuietly();
                out = null;
                toast("Could not write file");
            }
        }

        private void closeQuietly() {
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
        }

        private String safeName(String n) {
            if (n == null || n.trim().isEmpty()) return "file";
            String s = n.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            return s.isEmpty() ? "file" : s;
        }

        private void toast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
