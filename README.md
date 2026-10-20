# MiTV (Android + Android TV)

App propia: reproductor IPTV con TU lista de canales (`data/canales.json`).
No carga ninguna web externa; todo (interfaz y lista) va dentro de la app.
Sin Android Studio ni Flutter.

## Verla en Visual Studio Code
1. Abre esta carpeta en VS Code.
2. Terminal: `npm install` (copia hls.js y genera `www/canales.js`).
3. `npm run preview` -> abre http://localhost:8080/preview/ (botones Teléfono / Tablet / TV)
   (o clic derecho en `preview/index.html` > Open with Live Server).
   Con el teclado puedes probar el control de TV: flechas, Enter, Esc.
   F12 > modo dispositivo para ver tamaño de celular.

## Compilar el APK (en la nube)
1. Sube esta carpeta a un repositorio de GitHub.
2. Actions > Build APK > Run workflow.
3. Descarga el artefacto **MiTV-apk** (`app-debug.apk`) e instálalo en celular o TV.

## Cambiar canales
Reemplaza `data/canales.json` y corre `npm run postinstall` (o vuelve a hacer push).

## Límites
- Solo se incluyen canales `compatible: true` en formato hls / youtube / iframe (971).
  Los de Dailymotion ("stream") se omiten.
- Canales con `referrer` o geobloqueados pueden no abrir.
- En el navegador (preview) muchos HLS fallan por CORS; en el APK se usa
  CapacitorHttp (peticiones nativas) para evitarlo. Pruébalo en el APK real.
