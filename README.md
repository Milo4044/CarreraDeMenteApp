# 🧠 Carrera de Mente · App Android

App **offline** de apoyo para jugar al juego de mesa *Carrera de Mente*. Las preguntas salen de un archivo **CSV**; no necesita internet, servidor ni base de datos.

**Cómo se juega**
1. En el menú tocás una categoría (o ⭐ **Pregunta Estrella**, las difíciles).
2. Sale una pregunta al azar y empieza a sonar el reloj de tensión.
3. Quien lee la pregunta ve las opciones (A / B / C) **en MAYÚSCULA** y toca la que respondieron los jugadores. Si la pregunta no tiene opciones, toca *Ver respuesta* y después *Correcto* o *Incorrecto*.
4. No revela al instante: hay unos segundos de suspenso (`SEGUNDOS_SUSPENSO`, 3 s) y recién ahí suena el sonido de **éxito** o la **chicharra**.
5. El resultado queda a la vista y a los 12 s (`SEGUNDOS_VUELTA`) la app **vuelve sola al menú**. También se puede volver antes con el botón o con "atrás".

**Stack:** HTML + CSS + JavaScript (módulos ES, sin frameworks) empaquetado como APK con [Capacitor](https://capacitorjs.com). Tests con `node:test`.

## El archivo CSV

Un archivo con estas columnas (el orden no importa, excel en español con `;` funciona):

```csv
categoria;pregunta;opcion_a;opcion_b;opcion_c;respuesta;estrella
Historia;¿En qué año llegó Colón a América?;1492;1500;1453;A;
Deportes;¿En qué deporte se habla de "birdie"?;;;;Golf;
Arte;¿Quién pintó Las Meninas?;Goya;Velázquez;Murillo;B;1
```

| Columna | Qué poner |
|---|---|
| `categoria` | Historia, Geografía, Naturaleza, Espectáculos, Arte, Deportes. Si agregás otra, aparece sola en el menú con su propio color. |
| `pregunta` | El texto de la pregunta. |
| `opcion_a/b/c` | Opcionales. Sin opciones (o con una sola) la pregunta es "abierta". |
| `respuesta` | La **letra** (A/B/C) o el **texto exacto** de la opción correcta. En las abiertas, el texto de la respuesta. |
| `estrella` | `1`, `si` o `true` para las Estrella. Esas solo salen con el botón ⭐, no en las categorías. |

Las filas con errores se ignoran y la app te avisa cuántas fueron y la primera. Acepta separador `;` `,` o tabulación, comillas, y archivos de Excel (UTF-8 o ANSI).

**Dos formas de usar tu CSV**
- **Dentro del APK:** reemplazá `www/preguntas.csv` y volvé a compilar.
- **Sin recompilar:** en el menú, **📂 Cargar mi CSV**. Queda guardado en el celular; **↺ Usar el original** vuelve al incluido.

## Sonidos

Poné tus archivos en `www/audio/` con estos nombres:

| Archivo | Cuándo suena |
|---|---|
| `timer.mp3` | Reloj de tensión, en loop desde que sale la pregunta hasta que se revela el resultado |
| `exito.mp3` | Respuesta correcta |
| `error.mp3` | Chicharra de respuesta incorrecta |

Si falta alguno, la app usa un sonido generado, así que funciona desde el primer día. El código está en `www/sonidos.js`.

## Conseguir el APK

### Opción A · GitHub Actions (no necesitás instalar nada)
1. Subí esta carpeta a un repositorio de GitHub (rama `main`).
2. Entrá a **Actions → Compilar APK** (se ejecuta solo en cada push; o *Run workflow*).
3. Cuando termine, bajá el artefacto **carrera-de-mente-apk** (un zip con `app-debug.apk`).
4. Pasalo al celular e instalalo (hay que permitir "instalar apps de orígenes desconocidos").

### Opción B · En tu PC
Requisitos: Node 20+, JDK 17 y Android Studio (o el SDK de Android).

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug        # en Windows: gradlew.bat assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
O con `npx cap open android` y *Build → Build APK(s)* desde Android Studio.

## Desarrollo

```bash
npm install
npm run dev     # sirve www/ en http://localhost:5173 para probar en el navegador
npm test        # tests del lector de CSV y del sorteo
```

## Estructura

```
www/
├── index.html      # pantallas: menú y pregunta
├── styles.css      # estilo tipo show de TV, pensado para celular
├── app.js          # flujo del juego (menú → pregunta → suspenso → resultado → menú)
├── csv.js          # lector de CSV: separadores, comillas, tildes, validación
├── sorteo.js       # pregunta al azar sin repetir hasta agotar el grupo
├── sonidos.js      # reloj / éxito / error (con respaldo generado)
├── preguntas.csv   # preguntas incluidas en el APK
└── audio/          # tus mp3
tests/              # node --test
android/            # proyecto Android generado por Capacitor
```
