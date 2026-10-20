#!/usr/bin/env python3
"""Parchea el proyecto Android generado por Capacitor para que sea instalable en Android TV
(leanback launcher, banner, sin pantalla tactil obligatoria) y permita HTTP en claro."""
import re, sys, pathlib

manifest = pathlib.Path("android/app/src/main/AndroidManifest.xml")
xml = manifest.read_text(encoding="utf-8")

# Features para TV
features = (
    '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n'
    '    <uses-feature android:name="android.software.leanback" android:required="false" />\n'
)
if "android.software.leanback" not in xml:
    xml = xml.replace("<application", features + "    <application", 1)

# Permisos
if "ACCESS_NETWORK_STATE" not in xml:
    xml = xml.replace(
        "</manifest>",
        '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n</manifest>',
    )

# Trafico HTTP (algunos canales usan http://)
if "usesCleartextTraffic" not in xml:
    xml = xml.replace("<application", '<application android:usesCleartextTraffic="true"', 1)

# Banner TV
if "android:banner" not in xml:
    xml = xml.replace("<application", '<application android:banner="@mipmap/ic_launcher"', 1)

# Categoria LEANBACK en la activity principal
if "LEANBACK_LAUNCHER" not in xml:
    xml = xml.replace(
        '<category android:name="android.intent.category.LAUNCHER" />',
        '<category android:name="android.intent.category.LAUNCHER" />\n'
        '                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
        1,
    )

manifest.write_text(xml, encoding="utf-8")
print("AndroidManifest.xml parcheado para Android TV")
