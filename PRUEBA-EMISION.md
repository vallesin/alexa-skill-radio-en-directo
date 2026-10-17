# Prueba de emisión — skill de Alexa "La Guarida de Loba"

Hora acordada: **______ (hora local, __/__/2026)**  ·  Participantes: propietario de la skill + administradora de la radio

## Nota para la administradora (mensaje para enviar)

> Hola. Te cuento lo que quiero comprobar en la emisión de prueba, para acordar hora.
>
> **Cómo funciona la skill:** en cada invocación una Lambda (AWS eu-west-1) descarga la home de la radio, lee el `#urladdress` (`https://uk14freenew.listen2myradio.com/live.mp3?typeportmount=<token>`) y le dice al Echo que reproduzca esa URL. El Echo conecta al stream directamente desde la red de mi casa, no pasa por Amazon.
>
> **Síntoma:** en 3 emisiones (15, 16 y 18/09), la primera invocación tras empezar la emisión no sonaba (el Echo reporta `MEDIA_ERROR_INTERNAL_SERVER_ERROR`). Comprobado a mano, a veces el mount responde `200 OK` con `text/html` y 1 byte (`"\n"`) en vez de audio. Una vez conectado (yo, tras entrar a la web), el resto de la emisión reconectaba sin problemas. Hoy, con la emisión ya en marcha, sonó a la primera, incluso tras 20 min sin usarla.
>
> **Hipótesis:** (A) el mount se "despierta" con la primera conexión de cada emisión, venga de quien venga; (B) algo ligado a mi IP o a haber cargado la web desde ella (cookie/sesión). La prueba distingue entre las dos.
>
> **Lo que te pido:**
> 1. Una emisión de prueba **sin oyentes**: conectas la fuente (DJ/encoder) y me avisas con la **hora exacta** en que empieza. Hasta que yo te diga, **nadie abre la web ni el stream**, ni tú ni yo.
> 2. Cuando yo te avise, harás de oyente **desde una red distinta a la mía**: primero solo **cargas la home sin dar a play** (te aviso cuándo), y después **play**.
> 3. Si tienes acceso al panel del servidor (listen2myradio): guarda o anota la hora de conexión de la fuente, las conexiones al mount (hora, IP, si aparecen como oyente) y si el mount se activa bajo demanda con el primer oyente.
> 4. Apunta también la hora exacta del apagado previo y cómo lo haces (¿se para el mount en el servidor o solo desconectas la fuente?), y la hora exacta en que reconectas la fuente para la prueba.
>
> **Preguntas por si las sabes:** ¿emites con AutoDJ o en directo desde encoder? ¿El servidor arranca el mount/relay al primer oyente? ¿Hay algo en el panel que muestre "fuente conectada" vs "oyentes"?
>
> Dime qué día y hora te vienen bien y lo cerramos. ¡Gracias!

## Protocolo (lo que hacemos el día de la prueba)

Antes: nadie de mi red abre la web de la radio; no se hacen `curl`/Chrome desde mi PC.

| Paso | Quién | Acción | Anotar |
|------|-------|--------|--------|
| 0 | Administradora | Conecta la fuente y avisa | Hora exacta de inicio |
| 1 | Yo | Invoco la skill sin nadie conectado. Si falla, repito cada ~30 s (máx. ~5 min) sin abrir la web | Hora y resultado de cada intento (a la primera / tarda / aro encendido sin sonido) |
| 2 | Administradora | *(solo si el paso 1 falló)* Carga la home desde su red **sin dar play** | Hora |
| 3 | Yo | Invoco de nuevo | Resultado |
| 4 | Administradora | *(solo si sigue fallando)* Da **play** en el reproductor web | Hora |
| 5 | Yo | Invoco de nuevo | Resultado |

**Cómo se interpreta:**
- Paso 1 suena a la primera → cae la hipótesis A; el fallo era un corte puntual del proveedor.
- Falla en 1 y suena tras el paso 4 (o 2) sin que yo toque la web → hipótesis A: el primer oyente de la emisión activa el mount, venga de quien venga.
- Falla en 1 y sigue fallando aunque ella escuche → hipótesis B: algo depende de mi IP o de mi sesión.

Después: se revisa CloudWatch (`/aws/lambda/la-guarida-de-loba-skill`, eu-west-1). Con el logging nuevo, cada invocación deja líneas `request`, `checkLiveStream` y `AudioPlayer.PlaybackFailed` con el error.

## Estado y pendientes

- Logging nuevo desplegado y verificado en CloudWatch el 20/09 (commit `fab568c`). Cada invocación deja líneas JSON `evt`: `request` (tipo, intent, reintento, offset) y `checkLiveStream` (live, error, ms). Filtros útiles en el grupo `/aws/lambda/la-guarida-de-loba-skill`, vista "All events": `evt`, `checkLiveStream`, `PlaybackFailed`.
- **No se toca el código antes de la prueba**, para no meter ruido.
- Tras la prueba: valorar subir `HOME_FETCH_TIMEOUT_MS` de 3000 a ~5000. El fetch de la home tarda ~2,7 s desde la Lambda (Irlanda), el margen es justo; el timeout de la Lambda es de 8 s.
- Antes de la prueba: parar Alexa si está sonando ("Alexa, para").

## Resultados

Prueba realizada el 21/09/2026. Horas locales (CEST); CloudWatch está en UTC, restar 2 h.

| Hora | Quién | Qué pasó |
|------|-------|----------|
| 12:05 | Administradora | Conecta la fuente (emisión encendida). |
| 12:06:08–12:10:18 | Propietario | Paso 1: 10 invocaciones cada ~30 s, sin nadie conectado y sin abrir la web. **Fallan las 10.** Cada una: `checkLiveStream` `live:true`, y 3 `PlaybackFailed` (`retry` 0, 1 y 2) con `MEDIA_ERROR_INTERNAL_SERVER_ERROR` (30 errores). |
| 12:18 | Administradora | Paso 2: carga la home desde su red, **sin play**. |
| 12:19:54 | Propietario | Paso 3: 1 invocación. **Falla** igual (3 `PlaybackFailed`). El fetch de la home tardó 2,5 s (arranque en frío). |
| 12:23–12:24 | Administradora | Paso 4: da play; confirma que le suena. |
| 12:24:39–12:25:18 | Propietario | Paso 5: 4 invocaciones (el propietario recuerda hasta las 12:26; CloudWatch registra la última a las 12:25:18). **Fallan las 4** con la administradora escuchando. |
| entre 12:25 y 12:28 | Propietario | Carga la home en una pestaña de Chrome **desde su red**, sin play. Hora exacta no anotada. |
| 12:28:44 | Propietario | Invoca la skill: **funciona a la primera** (`LaunchRequest` → `checkLiveStream` `live:true` → `PlaybackStarted`, sin `PlaybackFailed`). |
| 12:29:09–12:29:20 | Claude | Carga la home en Chrome desde el PC del propietario. **Posterior** al éxito de las 12:28:44, por lo que no interviene en él. |

### Conclusión

- **Hipótesis A descartada**: con la fuente conectada y un oyente real recibiendo audio desde otra red, el Echo del propietario siguió fallando. El primer oyente no activa el mount para todos.
- **Hipótesis B muy probable, no demostrada al 100 %**: el stream solo sirvió audio al Echo después de que el propietario cargara la home desde su propia red (misma IP pública que el Echo). Cargarla desde la red de la administradora (12:18) no sirvió. Coincide con las observaciones del 15, 16 y 18/09.
- **Confusor pendiente**: entre el último fallo (12:25:18) y el éxito (12:28:44) pasaron ~3,5 min, así que no se descarta del todo un retardo del mount independiente de la home. Para aislarlo haría falta una emisión nueva (fuente desconectada y vuelta a conectar).
- La Lambda funcionó correctamente en todas las invocaciones: `live:true`, sin errores; el fallo estaba siempre en la conexión del Echo al stream.
- **Implicación**: cada oyente tiene otra IP, así que la solución no puede ser "cargar la home desde la IP del propietario". Hay que averiguar qué hace el servidor al servir la home. El token `typeportmount` sugiere protección de stream por token o por IP del proveedor (listen2myradio); preguntar a la administradora si el panel tiene una opción así.

## Segunda prueba de emisión (21/09/2026, tarde-noche)

Horas locales (CEST); CloudWatch/`curl` de CloudShell en UTC (restar/sumar 2 h). La fuente se conectó a las 20:03, se cayó un rato y volvió hacia las 20:17.
Objetivo: separar "token ligado a la IP" de "IP autorizada" usando **AWS CloudShell** (IP fría de Amazon, sin depender del Echo). Tres IP: **A** `54.220.237.188`
(eu-west-1), **B** `18.204.196.50` (us-east-1), **C** `44.243.57.213` (us-west-2).

### Cómo se falla y cómo se acierta
- URL viva: `https://uk14freenew.listen2myradio.com/live.mp3?typeportmount=s1_12613_stream_<número aleatorio nuevo en cada carga de la home>`. Servidor tipo Shoutcast (la respuesta empieza por `ICY `).
- **Fallo**: `http=200 bytes=1 type=text/html` (el byte es `0x0a`). **Éxito**: `audio/mpeg`, ~340 KB en 6 s.

### Resultados
| Hora | Quién / dónde | Qué se hizo | Resultado |
|------|---------------|-------------|-----------|
| 20:18-20:21 | A y B | Home + stream con `curl` simple (UA de navegador), sin cookie ni AJAX. A 4 veces, B 3 veces (B con la URL de A, sin haber cargado la home) | **Todo falla** (1 byte), incluida A tras cargar su propia home |
| 20:25 | Echo | Invocación en frío | Falla (aro largo, sin sonido) |
| 20:28 | PC del propietario | Solo `curl` de la home (200), sin navegador ni JS; luego Alexa | Falla |
| 20:30 | PC del propietario | Abre la home en el navegador **sin play**; luego Alexa | **Suena** |
| 20:34-20:35 | A | `probe3`: home con cookie + `POST getRecentSong.ajax.php` + `POST openfire.ajax.php?radio_id=3390014` + stream con `Referer`, cookie y `Range` | Iteración 1: `206`, 1 byte. Iteración 2 (10 s después): **audio** |
| 20:38-20:39 | B | Simple falla (20:37, 3/3). Después `probe3` | Iteración 1: falla. Iteración 2: **audio** |
| 20:41 | A y B | Simple, sin nada | **Audio** en las dos (la puerta ya estaba abierta para la IP) |
| 20:52 | C (IP fresca) | Solo home con cookie + las 2 llamadas AJAX, **sin tocar el stream**; a los 17 s, simple | **Audio** |
| 20:55-20:56 | A y B | Simple | **Audio** (14,5 y 15 min desde el último contacto) |
| 21:10 | B y Echo | B simple; el Echo se paró a las 20:47 y se invoca **sin abrir la web** | **Audio** en B (13 min de reposo) y **suena el Echo** (23 min de reposo) |
| 21:31 | A (sesión reiniciada; IP nueva `63.34.12.50`) | Simple, sin nada | **Falla** (1 byte). La sesión de CloudShell se reinició por inactividad y cambió de IP, así que **no mide el reposo de A**; solo confirma que una IP fresca no recibe audio (4.ª IP fresca con el mismo resultado). |
| 21:32 | Echo | Invocación sin abrir la web (parado a las 21:11, ~21 min de reposo) | **Suena**, pero "tarda" más de lo habitual (sin comprobar en CloudWatch si hubo reintentos por `PlaybackFailed`). |

### Conclusiones
1. **Causa**: el servidor del stream solo sirve audio a una IP **después de que esa IP haya hecho las llamadas que hace la página al cargarse**: `getRecentSong.ajax.php` y `openfire.ajax.php?radio_id=3390014`. Sin ellas responde `200` con 1 byte de `text/html`. Con solo esas dos llamadas (más el GET de la home para la cookie) basta, sin intento previo de stream. **La puerta es `openfire.ajax.php`** (casi seguro): devuelve la URL `…/aplication_xmp_firewall_open_cp.php?radio_id=…&HTTP_X_FORWARDED_FOR=&REMOTE_ADDR=<IP del que llama>&HTTP_REFERER=…&HTTP_CLIENT_IP=`, es decir, abre un cortafuegos para esa IP. La página la llama al cargar y luego **cada 6 000 000 ms (100 min)**, lo que sugiere que la autorización dura del orden de 100 min. `getRecentSong` (siempre `{"status":"error","message":"Error has Occuered"}`, también desde el PC) es solo el widget de canciones.
2. La puerta se abre unos segundos después de las llamadas (a 1-2 s no; a ~10-17 s sí) y queda abierta **para toda la IP**: cualquier cliente de esa IP recibe audio, sin cookie ni cabeceras. Dura **al menos 23 min** de reposo (Echo).
3. **No basta**: solo `GET` de la home (ni desde AWS, ni con `curl` desde el PC), ni intentar el stream repetidamente.
4. **Por qué falla la skill**: la Lambda pide la home desde su IP (Irlanda), pero el que conecta al stream es el Echo, desde otra IP que nunca ha hecho esas llamadas. Solo el primer oyente de cada IP encuentra la puerta cerrada; después reconecta sin problemas (coincide con lo observado el 15, 16, 18 y 20/09). **La Lambda por sí sola no puede arreglarlo.**
5. La administradora confirma que su panel no tiene opciones de token/hotlink/IP: solo IP y puerto de la fuente. Si hay que cambiar algo del lado del proveedor, lo decide listen2myradio.

### Opciones
| # | Opción | Coste | Arregla |
|---|--------|-------|---------|
| 1 | Pedir al soporte de listen2myradio (vía la administradora) que quite la restricción o dé una URL de escucha directa | Gratis | A todos, si aceptan |
| 2 | La skill avisa tras el fallo: "abre la web de la radio desde el móvil conectado al mismo wifi y repite" (solo cambia la Lambda) | Casi nada | Da una salida, no es automático |
| 3 | Proxy en Cloudflare Worker (`cloudflare-worker/worker.js`) | Gratis | **Probado el 21/09: no funciona** (ver abajo) |
| 4 | **Raspberry (o cualquier equipo siempre encendido en casa) con `cron`** llamando a `openfire` cada 30 min (`raspberry/abrir-puerta.sh`). Como el Echo comparte IP pública con la Raspberry, la puerta está siempre abierta para él y no hace falta proxy | Gratis | **Solo al propietario** (y a quien comparta su IP pública); script probado en el PC el 21/09 (`OK puerta abierta para <IP-DEL-PROPIETARIO>`), **pendiente de probar con emisión en frío** |
| 3b | **Proxy en un servidor con IPv4 fija** (p. ej. Lightsail/EC2 pequeño + HTTPS): hace `openfire` y retransmite el audio | Unos euros al mes | A todos, automático; sin probar |

Mensaje enviado a la administradora (21/09 noche) con las tres preguntas para el soporte: ¿se puede desactivar el registro por IP?, ¿hay URL directa sin esa comprobación?, ¿cuánto dura la autorización?

### Prueba del Cloudflare Worker (21/09, 22:20-22:50): NO funciona
Desplegado como `guarida-de-loba.vallesin.workers.dev` (cuenta de Cloudflare ya existente; el otro Worker `sonaos-proxy` es de otra radio, no se tocó). Con la emisión en directo:
- Versión 1 (home + `getRecentSong` + `openfire`, luego stream a los 0-20 s): las llamadas dan `200`, la cookie llega (36 bytes), pero **6/6 intentos dan 1 byte**. La IP de salida que ve Amazon es la IPv6 `2a06:98c0:3600::103`, estable.
- Versión 2 (solo `openfire`, 8 rondas de abrir → esperar 3 s → pedir stream): **8/8 fallos**. En todas las rondas la radio ve `REMOTE_ADDR=2a06:98c0:3600::103` (IPv6 de Cloudflare).
- Los servidores de la radio son **solo IPv4** (sin AAAA; `Apache/2`, no están tras Cloudflare). La puerta se abre para una IPv6 que el servidor del stream nunca verá en su conexión (llega por IPv4 desde otra dirección de Cloudflare). Es una inferencia, no demostrada, pero 8/8 con IP estable apunta a un **desajuste sistemático**, no a una lotería de IP.
- Descartado jugar con cabeceras (`X-Forwarded-For`, `Client-IP`) para engañar al cortafuegos: la respuesta de `openfire` las refleja, y no se va a falsificar la IP; además la Lambda no conoce la IP del Echo.
- Siguiente idea razonable: un proxy en una máquina con **IPv4 fija y única** (opción 3b), o lo que conteste el soporte de listen2myradio. Otro camino: Lambda con Function URL en modo streaming, pero corta a los 15 min y obligaría a re-encolar el stream.

### Opción 4 (propietario): `raspberry/abrir-puerta.sh` + cron
La Raspberry no retransmite nada: solo llama a `openfire.ajax.php` (con la cookie de la home) cada 30 min desde la red de casa, lo que mantiene autorizada la IP pública que también usa el Echo. El Echo sigue conectando directo al stream.
- Instalación: copiar el script a la Raspberry, `chmod +x`, comprobar que hace `curl` (`sudo apt install curl`) y añadir a `crontab -e`: `*/30 * * * * /home/pi/abrir-puerta.sh >> /home/pi/abrir-puerta.log 2>&1`. Cada ejecución deja una línea `OK puerta abierta para <IP>`.
- **Prueba de aceptación** (siguiente emisión): con el cron funcionando desde antes de que empiece la emisión y **sin abrir la web** en ningún equipo, invocar la skill en frío. Si suena a la primera, funciona.
- Dudas: (a) si la autorización se abre aunque la radio aún no emita (el cron corre también con la radio apagada); (b) si un intervalo de 30 min basta (la web renueva cada 100 min); (c) si la IP pública de casa cambia, la Raspberry la recupera en la siguiente ejecución.

### Helpers de CloudShell usados (bash, se pegan en la terminal)
```bash
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
H=https://laguaridadeloba.radio12345.com/
myip(){ echo "IP saliente: $(curl -s https://checkip.amazonaws.com)"; }
geturl(){ curl -s -m 15 -A "$UA" "$H" | python3 -c 'import re,sys,html;m=re.search(r"id=\"urladdress\">\s*([^<\s]+)",sys.stdin.read());print(html.unescape(m.group(1)) if m else "")'; }
probe(){ curl -s -m 6 -A "$UA" -o /tmp/s.bin -w "$(date +%T) stream http=%{http_code} bytes=%{size_download} type=%{content_type}\n" "$1"; echo "primeros bytes: $(head -c 4 /tmp/s.bin | xxd -p)"; }
ajaxonly(){ rm -f /tmp/cj; curl -s -m 15 -A "$UA" -c /tmp/cj -o /dev/null "$H"; curl -s -m 15 -A "$UA" -e "$H" -b /tmp/cj -c /tmp/cj -F action=getRadioRecentSongs -o /dev/null -w "$(date +%T) getRecentSong http=%{http_code}\n" "${H}getRecentSong.ajax.php"; curl -s -m 15 -A "$UA" -e "$H" -b /tmp/cj -c /tmp/cj -d '' -o /dev/null -w "$(date +%T) openfire http=%{http_code}\n" "${H}openfire.ajax.php?radio_id=3390014"; }
# Prueba mínima: ajaxonly; sleep 15; U=$(geturl); probe "$U"
```
