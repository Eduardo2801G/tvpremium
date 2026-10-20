#!/usr/bin/env python3
"""Convierte data/canales.json en www/canales.js (solo los campos que usa la app)."""
import json, pathlib
src = json.load(open("data/canales.json", encoding="utf-8"))
out = []
for c in src["canales"]:
    if not c.get("compatible") or c.get("formato") not in ("hls", "youtube", "iframe"):
        continue
    out.append({
        "id": c["id"], "n": c["nombre"], "l": c.get("logo") or "", "u": c["url"],
        "f": c["formato"], "c": (c.get("cats") or ["entretenimiento"])[0],
        "p": c.get("pais") or "", "g": (c.get("grupos") or [""])[0],
        "ok": bool(c.get("salud") and c["salud"].get("ok")),
        "geo": bool(c.get("geobloqueado")),
    })
out.sort(key=lambda x: (not x["ok"], x["n"].lower()))
pathlib.Path("www/canales.js").write_text(
    "window.CANALES=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";", encoding="utf-8")
print(len(out), "canales ->", "www/canales.js")
