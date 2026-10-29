package com.bigpickle.nebulaos;

import android.os.Build;
import android.webkit.WebView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;

/**
 * Native side of the on-device opencode agent.
 *
 *  - exec:        runs commands in the real Android shell (/system/bin/sh, toybox) inside the app workspace
 *  - read/write/list/exists: real files (Android/data/com.bigpickle.nebulaos/files/workspace)
 *  - httpStream:  streaming HTTPS done from Java, so the WebView's CORS rules do not apply and the
 *                 opencode User-Agent can be set; lines are delivered as `httpLine` events
 *  - httpFetch:   plain GET used by the webfetch tool
 *
 * Nothing here talks to a PC: the model is reached directly from the phone.
 */
@CapacitorPlugin(name = "NebulaNative")
public class NebulaNativePlugin extends Plugin {

    private File workspace() {
        File base = getContext().getExternalFilesDir(null);
        if (base == null) base = getContext().getFilesDir();
        File ws = new File(base, "workspace");
        if (!ws.exists()) {
            ws.mkdirs();
            try (FileOutputStream out = new FileOutputStream(new File(ws, "README.md"))) {
                out.write(("# Nebula OS workspace\n\nThis folder is on your phone: " + ws.getAbsolutePath()
                        + "\nThe opencode agent in Nebula OS reads, writes and runs shell commands here.\n").getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) { }
        }
        return ws;
    }

    private File tmp() {
        File t = new File(getContext().getCacheDir(), "tmp");
        new File(t, "opencode").mkdirs();
        return t;
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("platform", "android");
        r.put("workspace", workspace().getAbsolutePath());
        r.put("tmp", tmp().getAbsolutePath());
        r.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown");
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("release", Build.VERSION.RELEASE);
        r.put("shell", "/system/bin/sh");
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                android.content.pm.PackageInfo wv = WebView.getCurrentWebViewPackage();
                if (wv != null) r.put("webview", wv.versionName);
            }
        } catch (Exception ignored) { }
        call.resolve(r);
    }

    // ---------------- shell ----------------
    @PluginMethod
    public void exec(PluginCall call) {
        final String command = call.getString("command", "");
        final String cwd = call.getString("cwd", workspace().getAbsolutePath());
        final long timeoutMs = call.getLong("timeoutMs", 120000L);
        new Thread(() -> {
            JSObject r = new JSObject();
            try {
                ProcessBuilder pb = new ProcessBuilder("/system/bin/sh", "-c", command);
                File dir = new File(cwd);
                if (!dir.isDirectory()) dir = workspace();
                pb.directory(dir);
                Map<String, String> env = pb.environment();
                env.put("HOME", workspace().getAbsolutePath());
                env.put("TMPDIR", tmp().getAbsolutePath());
                env.put("TERM", "dumb");
                env.put("OPENCODE", "1");
                env.put("NEBULA_OS", "android");
                Process p = pb.start();
                final StringBuilder out = new StringBuilder();
                final StringBuilder err = new StringBuilder();
                Thread to = pump(p.getInputStream(), out);
                Thread te = pump(p.getErrorStream(), err);
                // poll instead of Process.waitFor(timeout) so minSdk 24 stays lint-clean
                long deadline = System.currentTimeMillis() + timeoutMs;
                boolean finished = false;
                while (System.currentTimeMillis() < deadline) {
                    try { p.exitValue(); finished = true; break; } catch (IllegalThreadStateException ignored) { Thread.sleep(25); }
                }
                if (!finished) {
                    p.destroy();
                    err.append("\n[timeout after ").append(timeoutMs).append(" ms]");
                }
                to.join(2000); te.join(2000);
                r.put("stdout", cap(out));
                r.put("stderr", cap(err));
                r.put("code", finished ? p.exitValue() : 124);
            } catch (Exception e) {
                r.put("stdout", "");
                r.put("stderr", "exec failed: " + e.getMessage());
                r.put("code", 127);
            }
            call.resolve(r);
        }).start();
    }

    private static Thread pump(final InputStream in, final StringBuilder sb) {
        Thread t = new Thread(() -> {
            try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                char[] buf = new char[4096];
                int n;
                while ((n = br.read(buf)) > 0) { if (sb.length() < 400000) sb.append(buf, 0, n); }
            } catch (Exception ignored) { }
        });
        t.start();
        return t;
    }

    private static String cap(StringBuilder sb) {
        return sb.length() > 200000 ? sb.substring(0, 200000) + "\n…(truncated)" : sb.toString();
    }

    // ---------------- files ----------------
    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path", "");
        File f = new File(path);
        if (!f.isFile()) { call.reject("ENOENT: no such file " + path); return; }
        if (f.length() > 20L * 1024 * 1024) { call.reject("file too large: " + path); return; }
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] data = new byte[(int) f.length()];
            int off = 0, n;
            while (off < data.length && (n = in.read(data, off, data.length - off)) > 0) off += n;
            JSObject r = new JSObject();
            r.put("content", new String(data, 0, off, StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String path = call.getString("path", "");
        String content = call.getString("content", "");
        File f = new File(path);
        File parent = f.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (Exception e) {
            call.reject("write failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        String path = call.getString("path", "");
        File d = new File(path);
        if (!d.isDirectory()) { call.reject("ENOENT: no such directory " + path); return; }
        JSArray arr = new JSArray();
        File[] files = d.listFiles();
        if (files != null) {
            for (File f : files) {
                JSObject e = new JSObject();
                e.put("name", f.getName());
                e.put("dir", f.isDirectory());
                e.put("size", f.length());
                arr.put(e);
            }
        }
        JSObject r = new JSObject();
        r.put("entries", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void exists(PluginCall call) {
        File f = new File(call.getString("path", ""));
        JSObject r = new JSObject();
        r.put("exists", f.exists());
        r.put("dir", f.isDirectory());
        call.resolve(r);
    }

    // ---------------- HTTP ----------------
    @PluginMethod
    public void httpStream(PluginCall call) {
        final String id = call.getString("id", "");
        final String url = call.getString("url", "");
        final String method = call.getString("method", "POST");
        final String body = call.getString("body", "");
        final JSObject headers = call.getObject("headers", new JSObject());
        new Thread(() -> {
            int status = 0;
            String error = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestMethod(method);
                c.setConnectTimeout(30000);
                c.setReadTimeout(180000);
                c.setUseCaches(false);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) { String k = keys.next(); c.setRequestProperty(k, headers.getString(k)); }
                c.setRequestProperty("Accept", "*/*");
                c.setRequestProperty("Accept-Encoding", "identity");
                if (!"GET".equals(method)) {
                    c.setDoOutput(true);
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    c.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream out = c.getOutputStream()) { out.write(bytes); }
                }
                status = c.getResponseCode();
                InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                if (in != null) {
                    try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                        String line;
                        StringBuilder errBody = new StringBuilder();
                        while ((line = br.readLine()) != null) {
                            if (status >= 400) { if (errBody.length() < 2000) errBody.append(line); continue; }
                            JSObject ev = new JSObject();
                            ev.put("id", id);
                            ev.put("line", line);
                            notifyListeners("httpLine", ev);
                        }
                        if (status >= 400) error = errBody.toString();
                    }
                }
                c.disconnect();
            } catch (Exception e) {
                error = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            JSObject end = new JSObject();
            end.put("id", id);
            end.put("status", status);
            if (error != null) end.put("error", error);
            notifyListeners("httpEnd", end);
        }).start();
        JSObject r = new JSObject();
        r.put("started", true);
        call.resolve(r);
    }

    @PluginMethod
    public void httpFetch(PluginCall call) {
        final String url = call.getString("url", "");
        final int timeoutMs = call.getInt("timeoutMs", 30000);
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(timeoutMs);
                c.setReadTimeout(timeoutMs);
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) NebulaOS/1.2 opencode-native");
                c.setRequestProperty("Accept", "text/markdown, text/html, text/plain, */*");
                int status = c.getResponseCode();
                InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                StringBuilder sb = new StringBuilder();
                if (in != null) {
                    try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                        char[] buf = new char[8192];
                        int n;
                        while ((n = br.read(buf)) > 0 && sb.length() < 2000000) sb.append(buf, 0, n);
                    }
                }
                JSObject r = new JSObject();
                r.put("status", status);
                r.put("contentType", c.getContentType() == null ? "" : c.getContentType());
                r.put("body", sb.toString());
                c.disconnect();
                call.resolve(r);
            } catch (Exception e) {
                call.reject("fetch failed: " + e.getMessage());
            }
        }).start();
    }
}
