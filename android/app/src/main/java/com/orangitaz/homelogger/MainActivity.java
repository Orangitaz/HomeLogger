package com.orangitaz.homelogger;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
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
import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

        // ---- Native HTTP, used by "Sync with TrueNAS". Doing the request here (not with fetch in the page)
        // avoids web-security rules that block an https page from reaching a server on the home network. ----
        private final Map<String, HttpJob> jobs = new ConcurrentHashMap<>();

        private class HttpJob {
            String method, url;
            JSONObject headers = new JSONObject();
            File body, resp;
            OutputStream bodyOut;
        }

        private File httpDir() {
            File dir = new File(getCacheDir(), "http");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            return dir;
        }

        @JavascriptInterface
        public void httpBegin(String id, String method, String url, String headersJson) {
            HttpJob j = new HttpJob();
            j.method = method;
            j.url = url;
            try {
                j.headers = new JSONObject(headersJson);
            } catch (Exception ignored) {
            }
            try {
                j.body = new File(httpDir(), "req_" + safeName(id));
                j.bodyOut = new FileOutputStream(j.body);
            } catch (Exception e) {
                j.bodyOut = null;
            }
            jobs.put(id, j);
        }

        @JavascriptInterface
        public void httpBody(String id, String b64) {
            HttpJob j = jobs.get(id);
            if (j == null || j.bodyOut == null) return;
            try {
                j.bodyOut.write(Base64.decode(b64, Base64.DEFAULT));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void httpSend(final String id) {
            final HttpJob j = jobs.get(id);
            if (j == null) return;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    runHttp(id, j);
                }
            }).start();
        }

        private void runHttp(String id, HttpJob j) {
            int status = 0;
            String headers = "{}";
            String err = "";
            HttpURLConnection c = null;
            try {
                if (j.bodyOut != null) j.bodyOut.close();
                c = (HttpURLConnection) new URL(j.url).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(120000);
                c.setInstanceFollowRedirects(false);
                c.setRequestMethod(j.method);
                Iterator<String> keys = j.headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    c.setRequestProperty(k, j.headers.getString(k));
                }
                long blen = j.body != null ? j.body.length() : 0;
                if (blen > 0 || "POST".equals(j.method) || "PUT".equals(j.method)) {
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(blen);
                    OutputStream os = c.getOutputStream();
                    if (blen > 0) {
                        FileInputStream in = new FileInputStream(j.body);
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                        in.close();
                    }
                    os.close();
                }
                status = c.getResponseCode();
                InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
                j.resp = new File(httpDir(), "resp_" + safeName(id));
                FileOutputStream fo = new FileOutputStream(j.resp);
                if (is != null) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = is.read(buf)) > 0) fo.write(buf, 0, n);
                    is.close();
                }
                fo.close();
                JSONObject h = new JSONObject();
                h.put("content-type", c.getContentType() == null ? "" : c.getContentType());
                headers = h.toString();
            } catch (Exception e) {
                status = 0;
                err = e.getClass().getSimpleName() + ": " + e.getMessage();
            } finally {
                if (c != null) c.disconnect();
            }
            final String js = "window.__httpDone(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(headers) + "," + JSONObject.quote(err) + ")";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public int httpSize(String id) {
            HttpJob j = jobs.get(id);
            return (j == null || j.resp == null) ? 0 : (int) j.resp.length();
        }

        @JavascriptInterface
        public String httpRead(String id, int offset, int len) {
            HttpJob j = jobs.get(id);
            if (j == null || j.resp == null) return "";
            try {
                RandomAccessFile f = new RandomAccessFile(j.resp, "r");
                byte[] buf = new byte[(int) Math.min((long) len, Math.max(0L, f.length() - offset))];
                f.seek(offset);
                f.readFully(buf);
                f.close();
                return Base64.encodeToString(buf, Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void httpClose(String id) {
            HttpJob j = jobs.remove(id);
            if (j == null) return;
            try {
                if (j.bodyOut != null) j.bodyOut.close();
            } catch (Exception ignored) {
            }
            if (j.body != null) //noinspection ResultOfMethodCallIgnored
                j.body.delete();
            if (j.resp != null) //noinspection ResultOfMethodCallIgnored
                j.resp.delete();
        }

        // ---- Print / save as PDF (used by the history report) ----
        @JavascriptInterface
        public void printPage(final String jobName) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        pm.print(jobName, web.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Could not open the print dialog", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        // ---- Receipt text recognition, on the phone (ML Kit). The web page sends the photo, gets the text back. ----
        private final Map<String, ByteArrayOutputStream> ocrBufs = new ConcurrentHashMap<>();

        @JavascriptInterface
        public void ocrBegin(String id) {
            ocrBufs.put(id, new ByteArrayOutputStream());
        }

        @JavascriptInterface
        public void ocrBody(String id, String b64) {
            ByteArrayOutputStream b = ocrBufs.get(id);
            if (b == null) return;
            byte[] d = Base64.decode(b64, Base64.DEFAULT);
            b.write(d, 0, d.length);
        }

        @JavascriptInterface
        public void ocrRun(final String id) {
            ByteArrayOutputStream b = ocrBufs.remove(id);
            if (b == null) {
                ocrDone(id, "", "no image");
                return;
            }
            try {
                byte[] bytes = b.toByteArray();
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
                int sample = 1;
                while (Math.max(o.outWidth, o.outHeight) / sample > 2600) sample *= 2;
                o.inJustDecodeBounds = false;
                o.inSampleSize = sample;
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
                if (bmp == null) {
                    ocrDone(id, "", "unreadable image");
                    return;
                }
                TextRecognizer rec = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                rec.process(InputImage.fromBitmap(bmp, 0))
                        .addOnSuccessListener(new OnSuccessListener<Text>() {
                            @Override
                            public void onSuccess(Text text) {
                                ocrDone(id, text.getText(), "");
                            }
                        })
                        .addOnFailureListener(new OnFailureListener() {
                            @Override
                            public void onFailure(Exception e) {
                                ocrDone(id, "", String.valueOf(e.getMessage()));
                            }
                        });
            } catch (Exception e) {
                ocrDone(id, "", String.valueOf(e.getMessage()));
            }
        }

        private void ocrDone(String id, String text, String err) {
            final String js = "window.__ocrDone(" + JSONObject.quote(id) + "," + JSONObject.quote(text) + "," + JSONObject.quote(err) + ")";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.evaluateJavascript(js, null);
                }
            });
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
