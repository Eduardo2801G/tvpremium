#!/usr/bin/env python3
"""Reemplaza MainActivity.java del proyecto Android generado por Capacitor:
 - permite reproducir video/audio sin gesto previo del usuario (sin mute ni "dar play")
 - agrega el puente GolTap: la app pide un toque real en pantalla (cursor del control remoto)."""
import glob, re, sys

paths = glob.glob("android/app/src/main/java/**/MainActivity.java", recursive=True)
if not paths:
    sys.exit("No se encontro MainActivity.java")
path = paths[0]
src = open(path, encoding="utf-8").read()
m = re.search(r"^package\s+([\w.]+);", src, re.M)
if not m:
    sys.exit("No se encontro el package en MainActivity.java")

java = """package __PKG__;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    final WebView wv = getBridge().getWebView();
    // Reproducir con sonido sin que el usuario toque primero
    wv.getSettings().setMediaPlaybackRequiresUserGesture(false);
    // Puente: la pagina pide un toque real en (x, y) pixeles
    wv.addJavascriptInterface(new TapBridge(wv), "GolTap");
  }

  static class TapBridge {
    private final WebView wv;

    TapBridge(WebView wv) {
      this.wv = wv;
    }

    @JavascriptInterface
    public void tap(final double x, final double y) {
      wv.post(new Runnable() {
        @Override
        public void run() {
          final long t = SystemClock.uptimeMillis();
          MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, (float) x, (float) y, 0);
          down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
          wv.dispatchTouchEvent(down);
          down.recycle();
          wv.postDelayed(new Runnable() {
            @Override
            public void run() {
              MotionEvent up = MotionEvent.obtain(t, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, (float) x, (float) y, 0);
              up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
              wv.dispatchTouchEvent(up);
              up.recycle();
            }
          }, 70);
        }
      });
    }
  }
}
""".replace("__PKG__", m.group(1))

open(path, "w", encoding="utf-8").write(java)
print("MainActivity.java parcheado:", path)