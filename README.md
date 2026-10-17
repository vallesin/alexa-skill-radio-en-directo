# Skill de Alexa para una radio online en directo

Skill de Alexa (interfaz `AudioPlayer`) con una AWS Lambda sin dependencias que reproduce
el stream de una emisora online **que emite de forma intermitente**. En cada invocación
comprueba si hay emisión; si la hay, reproduce; si no, responde solo por voz.

Se construyó para la radio *La Guarida de Loba* (alojada en listen2myradio / radio12345),
pero la estructura y, sobre todo, las lecciones aprendidas sirven para cualquier emisora
cuyo stream cambie de URL o no esté siempre activo.

> **Estado:** terminada y probada con voz real en un Echo (octubre 2026). Se quedó como
> skill privada en modo desarrollo y **no se publicó**, porque la propietaria de la radio
> desarrolló la suya. El repositorio queda como referencia y caso de estudio.

## Qué puede aprovechar quien lo lea

- **Una skill de radio en directo mínima y completa:** modelo de interacción en español,
  handler de Lambda sin dependencias, reintento de reproducción y prueba local sin AWS.
- **Detectar si una radio intermitente está emitiendo** sin tocar el stream (ver abajo).
- **Una lista de trampas reales** de Alexa, AWS y proveedores de streaming gratuitos, con
  cómo se diagnosticó cada una (sección "Lecciones aprendidas").

## Estructura

```
skill-package/
  skill.json                              # manifiesto de la skill (ARN de ejemplo)
  interactionModels/custom/es-ES.json     # modelo de interacción (es-ES)
lambda/
  index.js                                # handler (CommonJS, sin dependencias)
  test/local-test.js                      # prueba local sin AWS
deploy/build/index.mjs                    # el mismo handler en ESM, listo para pegar en Lambda
raspberry/abrir-puerta.sh                 # script de apoyo que se usó en pruebas (ya no hace falta)
cloudflare-worker/worker.js               # intento de proxy que no funcionó (ver lecciones)
PRUEBA-EMISION.md, PRUEBA-EN-FRIO.md      # protocolos de prueba con emisión real
```

## Cómo funciona

1. Al invocar la skill, la Lambda descarga la web de la radio y extrae la URL del stream de
   un elemento del HTML (`id="urladdress"`). **El token de la URL cambia en cada carga**,
   así que nunca se guarda una URL fija.
2. Si la URL tiene la forma del stream real (`*.listen2myradio.com[:puerto]/live.mp3?...`),
   responde con `AudioPlayer.Play`. Si no coincide, es que no hay emisión (la web apunta
   entonces a un MP3 de relleno en otro dominio) y responde solo con voz.
3. Si el Echo no consigue reproducir (`AudioPlayer.PlaybackFailed`), la Lambda vuelve a
   leer la web para obtener una URL fresca y reintenta hasta 2 veces. El número de intento
   viaja en el `token` de la reproducción (`...:retryN`), así que no necesita estado.

Para adaptarlo a otra emisora, cambia en `lambda/index.js` `HOME_URL`, el selector del
HTML (`STREAM_URL_REGEX`) y el patrón de URL de directo (`LIVE_STREAM_URL_PATTERN`), y
revisa el texto de las respuestas y el nombre de invocación en `skill-package/`.

## Lecciones aprendidas

Todo lo siguiente se verificó en la práctica, no es teoría.

- **No compruebes el audio desde la Lambda.** El primer diseño hacía una petición al
  stream para ver si llegaban bytes de audio. El proveedor devolvía a las IPs de AWS un
  `200 OK` con 1 byte de HTML, y la skill decía "no está emitiendo" aunque la radio
  estuviera en directo. El Echo, en cambio, conecta desde la red del usuario y funciona.
  Solución: decidir solo por la forma de la URL que publica la web.
- **Un 200 no significa audio.** Hay proveedores que rechazan con `200` y un cuerpo vacío.
  Mira siempre `content-type` y `content-length`; un stream real llega con
  `transfer-encoding: chunked` y sin `content-length`.
- **El "directo" de la web puede mentir.** En el plan premium la web da siempre una URL de
  stream, haya o no fuente conectada. Sin emisión el servidor responde `ICY 401` y el Echo
  falla con `MEDIA_ERROR_INVALID_REQUEST`. Mejora pendiente: sondear el stream con una
  petición corta antes de anunciar "en directo".
- **Alexa acepta puertos no estándar.** El stream premium solo servía por el puerto 2199
  (el 443 rechazaba la conexión) y el Echo lo reproduce sin problema. No hace falta montar
  un proxy para quitar el puerto.
- **Los mounts gratuitos se cortan solos.** La misma URL, sin cambiar nada, unas veces
  sirve audio y otras un HTML de 1 byte. Un reintento con URL fresca cubre cortes de un par
  de segundos; los más largos son del proveedor y no se arreglan desde la skill.
- **Algunos servidores abren el stream por IP.** El proveedor de este caso solo servía audio
  a una IP después de que esa IP llamara a un endpoint (`openfire.ajax.php`), cosa que hace
  su web al cargarse. Como el Echo no puede, se usó una Raspberry en la misma red que lo
  llamaba por cron (`raspberry/abrir-puerta.sh`). Con la radio premium **dejó de hacer falta**:
  la prueba en frío (`PRUEBA-EN-FRIO.md`) confirmó que suena sin ella.
- **Un proxy en Cloudflare Workers no sirvió** (`cloudflare-worker/worker.js`): el Worker
  salía por IPv6 y el proveedor autorizaba por IPv4.
- **Formato del handler en Lambda:** con runtime Node.js moderno el archivo es `index.mjs`
  (ESM). Pegar CommonJS (`exports.handler`) da error. Por eso hay dos copias; para
  regenerar el `.mjs` desde `lambda/index.js`, quita `"use strict";`, cambia
  `exports.handler =` por `export const handler =` y borra `exports._internal`.
- **Timeout de la Lambda:** el valor por defecto (3 s) se queda corto si lees una web
  externa; se subió a 8 s.
- **Frase de invocación en un solo turno:** el nombre de la skill debe ir justo después del
  verbo ("Alexa, pide **a la guarida de loba** ayuda"); al final de la frase Alexa no lo
  reconoce.
- **Ficha de la skill:** las frases de ejemplo no pueden coincidir con frases por defecto de
  Alexa ("hola", "ayuda"), y en el desplegable de categorías hay una entrada
  "Kids - Music & Audio - Radio" antes que la correcta "Music & Audio - Radio".
- **Beta Test sin certificar:** se puede invitar a oyentes por email durante 90 días (hasta
  500), pero la skill solo es elegible tras rellenar *Privacy & Compliance*. El modelo de voz
  es solo `es-ES`: quien tenga el Echo en `es-MX` o `es-US` no la reconocería.

## Despliegue manual

No hay CI/CD ni ASK CLI configurado. Son los pasos a mano desde las consolas de AWS y de
Alexa Developer.

### 1. Lambda

1. AWS Console → Lambda → **Crear función**, runtime **Node.js** (el archivo se llama
   `index.mjs`). No hay dependencias nativas, la arquitectura da igual.
2. Pega `deploy/build/index.mjs` en el editor de código. No hace falta `npm install`.
3. En **Configuration → General** sube el timeout a 8 s.
4. **Deploy**, y en **Triggers → Add trigger** elige **Alexa Skills Kit** (restringido al
   Skill ID cuando lo tengas).
5. Copia el **ARN** de la función.

Si el editor web de la consola da problemas, sube un `.zip` con `index.mjs` desde
**Actualizar → Actualizar desde un archivo .zip**; es más fiable.

### 2. Skill en Alexa Developer Console

1. https://developer.amazon.com/alexa/console/ask → **Create Skill** → modelo **Custom**,
   alojamiento **Provision your own**.
2. En **JSON Editor** pega `skill-package/interactionModels/custom/es-ES.json`.
3. En **Endpoint** elige **AWS Lambda ARN** y pega el ARN.
4. En **Interfaces** activa **Audio Player** (imprescindible para reproducir audio).
5. Guarda y pulsa **Build Model**.
6. `skill-package/skill.json` sirve de referencia para el manifiesto completo; sustituye el
   ARN de ejemplo por el real.

### 3. Probar

- **Simulador** (pestaña Test, modo Development): `abre la guarida de loba`.
- **Echo real:** aparece solo en la app de Alexa → Skills y Juegos → Tus Skills, si usas la
  misma cuenta de Amazon con la que creaste la skill.
- Prueba los dos casos: con la radio emitiendo debe sonar; con la radio parada debe decir
  por voz que no emite, sin sonido.

## Prueba local sin AWS

Con Node.js 20 o superior:

```bash
node lambda/test/local-test.js
```

Hace una petición real a la web de la radio y muestra si el handler decide reproducir (y con
qué URL) o responder que no está emitiendo. El resultado depende de si la emisora está en
directo en ese momento.

## Licencia

MIT. Ver `LICENSE`. El nombre y la marca de la emisora pertenecen a sus propietarios y no
se incluye su logotipo.
