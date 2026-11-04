/*
 * Pocket Rocket Flight Lab
 * Copyright (C) 2026 Dustin Lee
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program. If not, see
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package com.dustinlee.pocketrocket;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.graphics.Rect;
import android.view.ViewTreeObserver;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    static final int REQ_OPEN = 1;
    static final int REQ_SAVE = 2;
    WebView web;
    ValueCallback<Uri[]> fileCallback;
    byte[] pendingSave;
    boolean pendingAsSource;
    boolean keyboardOpen;
    // the design file the app last opened, kept so "Save changes" can write straight back into it
    Uri pendingUri, sourceUri;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setWebChromeClient(new Chrome(this));
        web.addJavascriptInterface(new Bridge(this), "PocketRocketApp");
        setContentView(web);
        // tell the page when the on-screen keyboard opens or closes, so it can bring the launch bar back
        web.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            public void onGlobalLayout() {
                Rect r = new Rect();
                web.getWindowVisibleDisplayFrame(r);
                int full = web.getRootView().getHeight();
                boolean open = full > 0 && (full - r.height()) > full * 0.15;
                if (open != keyboardOpen) {
                    keyboardOpen = open;
                    web.evaluateJavascript("(window.prKeyboard&&window.prKeyboard(" + open + "))", null);
                }
            }
        });
        try {
            String u = getSharedPreferences("files", 0).getString("source", null);
            if (u != null && u.length() > 0) sourceUri = Uri.parse(u);
        } catch (Exception e) { sourceUri = null; }
        // a file shared to the app (or opened with it) from another app
        if (state == null) takeIntent(getIntent());
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        takeIntent(i);
    }

    // a file shared to the app: read it now (the permission to read it lasts only a short while) and hand it to the page when it asks
    String inName, inData;
    void takeIntent(Intent i) {
        if (i == null) return;
        Uri u = null;
        try {
            String a = i.getAction();
            if ("android.intent.action.SEND".equals(a)) {
                Object p = i.getParcelableExtra("android.intent.extra.STREAM");
                if (p instanceof Uri) u = (Uri) p;
            } else if ("android.intent.action.VIEW".equals(a)) {
                u = i.getData();
            }
        } catch (Exception e) { u = null; }
        if (u == null) return;
        String name = null;
        Cursor c = null;
        try {
            c = getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception e) { }
        finally { try { if (c != null) c.close(); } catch (Exception e) { } }
        if (name == null || name.length() == 0) { try { name = u.getLastPathSegment(); } catch (Exception e) { } }
        if (name == null || name.length() == 0) name = "shared file";
        try {
            InputStream in = getContentResolver().openInputStream(u);
            if (in == null) { toast("Couldn't read that file."); return; }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > 40 * 1024 * 1024) { in.close(); toast("That file is too large to import."); return; }
            }
            in.close();
            synchronized (this) {
                inName = name.replace("\n", " ");
                inData = Base64.encodeToString(bo.toByteArray(), 2);
            }
        } catch (Exception e) {
            toast("Couldn't read that file.");
            return;
        }
        if (web != null) web.evaluateJavascript("(window.prIncoming&&window.prIncoming())", null);
    }

    // the page takes the shared file: its name, a line break, then its contents in base64 ("" if there is none)
    synchronized String takeIncoming() {
        if (inData == null) return "";
        String r = inName + "\n" + inData;
        inName = null;
        inData = null;
        return r;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    void openChooser(ValueCallback<Uri[]> cb) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        Intent i = new Intent("android.intent.action.OPEN_DOCUMENT");
        i.addCategory("android.intent.category.OPENABLE");
        i.setType("*/*");
        i.addFlags(1 | 2 | 64); // read, write, persistable
        try {
            startActivityForResult(i, REQ_OPEN);
        } catch (Exception e) {
            fileCallback = null;
            cb.onReceiveValue(null);
            toast("No file picker app is available.");
        }
    }

    void save(final String name, final String base64) {
        save(name, base64, false);
    }

    void save(final String name, final String base64, final boolean asSource) {
        byte[] bytes;
        try {
            bytes = Base64.decode(base64, 0);
        } catch (Exception e) {
            toast("Couldn't prepare the file.");
            return;
        }
        saveBytes(name, bytes, asSource);
    }

    // a large file (a video) arrives from the page in pieces
    ByteArrayOutputStream bigFile;
    String bigName;
    synchronized void beginFile(String name) { bigName = name; bigFile = new ByteArrayOutputStream(); }
    synchronized void appendFile(String base64) {
        if (bigFile == null) return;
        try { byte[] b = Base64.decode(base64, 0); bigFile.write(b, 0, b.length); } catch (Exception e) { bigFile = null; toast("Couldn't prepare the file."); }
    }
    synchronized void finishFile() {
        if (bigFile == null) return;
        byte[] b = bigFile.toByteArray();
        bigFile = null;
        saveBytes(bigName, b, false);
    }

    void saveBytes(final String name, final byte[] bytes, final boolean asSource) {
        // a new design isn't tied to any file until its own file is written (so a cancelled save can't write over another file)
        if (asSource) clearSource();
        runOnUiThread(new Runnable() {
            public void run() {
                pendingAsSource = asSource;
                pendingSave = bytes;
                Intent i = new Intent("android.intent.action.CREATE_DOCUMENT");
                i.addCategory("android.intent.category.OPENABLE");
                // a generic type keeps the .ork/.rkt name as given (an XML type makes some apps add ".xml")
                String low = name.toLowerCase();
                i.setType(low.endsWith(".pdf") ? "application/pdf" : low.endsWith(".mp4") ? "video/mp4" : low.endsWith(".csv") ? "text/csv" : low.endsWith(".json") ? "application/json" : "application/octet-stream");
                i.putExtra("android.intent.extra.TITLE", name);
                if (asSource) i.addFlags(1 | 2 | 64); // read, write, persistable: later saves write into it
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    pendingSave = null;
                    toast("No app is available to save files.");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_OPEN) {
            pendingUri = null;
            if (result == RESULT_OK && data != null && data.getData() != null) {
                pendingUri = data.getData();
                try { getContentResolver().takePersistableUriPermission(pendingUri, 1 | 2); }
                catch (Exception e) { try { getContentResolver().takePersistableUriPermission(pendingUri, 1); } catch (Exception e2) { } }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
                fileCallback = null;
            }
        } else if (request == REQ_SAVE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try {
                    OutputStream o = getContentResolver().openOutputStream(data.getData());
                    o.write(bytes);
                    o.close();
                    toast("File saved.");
                    if (pendingAsSource) {
                        Uri u = data.getData();
                        try { getContentResolver().takePersistableUriPermission(u, 1 | 2); } catch (Exception e) { }
                        useSource(u.toString());
                        String js = "(window.prSavedAs&&window.prSavedAs('" + u.toString().replace("\\", "\\\\").replace("'", "\\'") + "'))";
                        web.evaluateJavascript(js, null);
                    }
                } catch (Exception e) {
                    toast("Couldn't save the file.");
                }
            }
        }
    }

    // the page calls this once a picked file has opened as the current design
    synchronized void markSource() {
        if (pendingUri == null) return;
        sourceUri = pendingUri;
        try { getSharedPreferences("files", 0).edit().putString("source", sourceUri.toString()).apply(); } catch (Exception e) { }
    }

    // the page opened a design that has no file yet (the rocket builder): Save must ask where to save
    synchronized void clearSource() {
        sourceUri = null;
        pendingUri = null;
        try { getSharedPreferences("files", 0).edit().putString("source", "").apply(); } catch (Exception e) { }
    }

    synchronized String readUri(String uri) {
        try {
            InputStream in = getContentResolver().openInputStream(Uri.parse(uri));
            if (in == null) return "";
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            return Base64.encodeToString(bo.toByteArray(), 2);
        } catch (Exception e) {
            return "";
        }
    }

    synchronized void useSource(String uri) {
        try {
            sourceUri = Uri.parse(uri);
            pendingUri = null;
            getSharedPreferences("files", 0).edit().putString("source", uri).apply();
        } catch (Exception e) { sourceUri = null; }
    }

    // rename the open design file to match the rocket's new name; returns the file's name afterwards, or "" if it can't be renamed
    synchronized String renameSource(String name) {
        if (sourceUri == null) return "";
        try {
            Uri n = DocumentsContract.renameDocument(getContentResolver(), sourceUri, name);
            if (n == null) return "";
            try { getContentResolver().takePersistableUriPermission(n, 1 | 2); } catch (Exception e) { }
            useSource(n.toString());
            String shown = name;
            Cursor c = null;
            try {
                c = getContentResolver().query(n, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
                if (c != null && c.moveToFirst()) { String v = c.getString(0); if (v != null && v.length() > 0) shown = v; }
            } catch (Exception e) { }
            finally { try { if (c != null) c.close(); } catch (Exception e) { } }
            return shown;
        } catch (Exception e) {
            return "";
        }
    }

    // overwrite the open design file in place; false means the page should ask where to save instead
    boolean saveToSource(String base64) {
        if (sourceUri == null) return false;
        try {
            byte[] bytes = Base64.decode(base64, 0);
            // "wt" (write, truncate); some storage apps only take "rwt"
            OutputStream o = null;
            try { o = getContentResolver().openOutputStream(sourceUri, "wt"); } catch (Exception e) { o = null; }
            if (o == null) o = getContentResolver().openOutputStream(sourceUri, "rwt");
            if (o == null) return false;
            o.write(bytes);
            o.close();
            runOnUiThread(new Runnable() { public void run() { toast("File saved."); } });
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // coming back to the app: the keyboard is closed, so clear the page's typing state
    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("(window.prKeyboard&&window.prKeyboard(false))", null);
    }

    // Back: let the page close its animation window or pop-up first; only leave the app when nothing was open
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.prBack?window.prBack():false)", new ValueCallback<String>() {
            public void onReceiveValue(String r) {
                if (!"true".equals(r)) MainActivity.super.onBackPressed();
            }
        });
    }

    // messages show as a pop-up in the middle of the app screen; the system toast is the fallback
    void toast(final String text) {
        if (web == null) {
            Toast.makeText(this, text, Toast.LENGTH_LONG).show();
            return;
        }
        String js = "(window.prToast?window.prToast('" + text.replace("\\", "\\\\").replace("'", "\\'") + "'):false)";
        web.evaluateJavascript(js, new ValueCallback<String>() {
            public void onReceiveValue(String r) {
                if (!"true".equals(r)) Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show();
            }
        });
    }

    // fetch a web page off the main thread (only https), then hand its text back to the page as base64
    void fetchText(final String id, final String url) {
        final String safeId = id == null ? "" : id.replaceAll("[^A-Za-z0-9_]", "");
        new Thread(new Runnable() { public void run() {
            boolean ok = false; String body = "";
            java.net.HttpURLConnection c = null;
            try {
                if (url == null || !url.startsWith("https://")) throw new Exception("only https");
                c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                c.setRequestProperty("Accept", "application/json");
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); in.close(); }
                body = Base64.encodeToString(bo.toByteArray(), 2);
                ok = code >= 200 && code < 300;
                if (!ok && body.length() == 0) body = Base64.encodeToString(("HTTP " + code).getBytes("UTF-8"), 2);
            } catch (Exception e) {
                try { body = Base64.encodeToString(String.valueOf(e.getMessage()).getBytes("UTF-8"), 2); } catch (Exception e2) { body = ""; }
            } finally { if (c != null) c.disconnect(); }
            final String js = "(window.prFetchDone&&window.prFetchDone('" + safeId + "'," + ok + ",'" + body + "'))";
            runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
        } }).start();
    }

    // hand a geo: or https: link to whichever app handles it (the map app the user has chosen as default)
    boolean openExternal(final String uri) {
        if (uri == null || !(uri.startsWith("geo:") || uri.startsWith("https://"))) return false;
        try {
            final Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            runOnUiThread(new Runnable() { public void run() {
                try { startActivity(i); } catch (Exception e) { toast("No map app is installed to open this location."); }
            } });
            return true;
        } catch (Exception e) { return false; }
    }
}
