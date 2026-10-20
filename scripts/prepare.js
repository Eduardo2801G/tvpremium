// Copia hls.js a www/vendor y genera www/canales.js. Se ejecuta tras `npm install`.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const src = path.join("node_modules", "hls.js", "dist", "hls.min.js");
fs.mkdirSync("www/vendor", { recursive: true });
if (fs.existsSync(src)) fs.copyFileSync(src, "www/vendor/hls.min.js");
else console.warn("hls.js no encontrado; la app usara el CDN como respaldo");
const py = process.platform === "win32" ? "python" : "python3";
const r = cp.spawnSync(py, ["scripts/build_data.py"], { stdio: "inherit" });
if (r.status !== 0) console.warn("No se pudo ejecutar build_data.py (www/canales.js ya viene generado)");
