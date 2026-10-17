# Skill de Alexa — La Guarida de Loba

Skill de Alexa (interfaz AudioPlayer) para escuchar en directo la radio online
[La Guarida de Loba](https://laguaridadelobavip.radio12345.com/). La radio emite de forma
intermitente: la skill comprueba en cada invocación si hay emisión en directo antes de
reproducir nada, y si no la hay, responde solo por voz.

Estado: **TERMINADA (octubre 2026)**. Queda como skill privada en modo desarrollo (solo para
los Echo de la cuenta que la creó); **no se va a publicar**, porque la propietaria de la
radio desarrolló su propia skill. Prueba en frío con emisión real el 16/10/2026: suena a la
primera sin la Raspberry.

## Estructura

```
skill-package/
  skill.json                              # manifiesto de la skill
  interactionModels/custom/es-ES.json     # modelo de interacción (español)
lambda/
  index.js                                # handler de la Lambda (CommonJS, sin dependencias)
  test/local-test.js                      # prueba local sin AWS
deploy/build/index.mjs                    # lo mismo en ESM: es lo que se pega en la Lambda
raspberry/abrir-puerta.sh                 # script para la Raspberry (abre la "puerta" por IP)
PRUEBA-EMISION.md, PRUEBA-EN-FRIO.md      # notas y protocolos de pruebas con emisión real
```

## Cómo funciona

1. Al invocar la skill, la Lambda descarga la home de la radio
   (`https://laguaridadelobavip.radio12345.com/`) y extrae la URL de stream del
   `id="urladdress"` del HTML. **El token de la URL cambia en cada carga**, por eso no se
   guarda una URL fija.
2. Si la URL tiene la forma del stream real (`*.listen2myradio.com[:puerto]/live.mp3?...`),
   le dice a Alexa que la reproduzca (`AudioPlayer.Play`). No se comprueba el audio desde
   la Lambda: el proveedor bloquea las IPs de AWS, pero el Echo conecta directamente desde
   la red de casa.
3. Si no coincide, responde solo con voz: "La Guarida de Loba no está emitiendo en directo
   ahora mismo."
4. Si el Echo no consigue reproducir (`PlaybackFailed`), se reintenta hasta 2 veces con una
   URL nueva.

### Radio premium (desde el 04/10/2026)

- La radio emite ahora desde la home `laguaridadelobavip` (radio_id 3438332).
- El stream va por el **puerto 2199** (`https://us5new.listen2myradio.com:2199/live.mp3?...`);
  el 443 rechaza conexiones. Alexa acepta ese puerto, así que la URL se manda tal cual.
- La home vip da siempre una URL de `listen2myradio.com`, haya emisión o no. Si no hay fuente
  conectada, el servidor responde `ICY 401` y el Echo falla en silencio.

### La "puerta" por IP (Raspberry)

El servidor del stream solo sirve audio a una IP después de que se haya llamado a
`openfire.ajax.php` (lo hace la web de la radio al cargar y cada 100 min). El Echo no puede,
pero comparte IP pública con la Raspberry, que lo hacía por cron cada 30 min
(`raspberry/abrir-puerta.sh`). **Ya no hace falta** con la radio premium: la prueba en frío
(ver `PRUEBA-EN-FRIO.md`) confirmó que la skill suena sin ella. El script se conserva solo
como referencia.

## Despliegue manual

No hay CI/CD ni ASK CLI configurado: son los pasos para hacerlo a mano desde las
consolas de AWS y Alexa Developer.

### 1. Lambda

1. AWS Console → Lambda → **Crear función**.
   - Runtime: **Node.js 24.x** (el archivo se llama `index.mjs`).
   - Arquitectura: la que prefieras (no importa, no hay dependencias nativas).
2. Pega el contenido de **`deploy/build/index.mjs`** (no el de `lambda/index.js`, que es
   CommonJS y da error en una Lambda ESM) en el editor de código inline. No hace falta
   `npm install` ni subir un zip, no tiene dependencias. Si cambias `lambda/index.js`,
   regenera el `.mjs`: quita `"use strict";`, cambia `exports.handler =` por
   `export const handler =` y borra la línea `exports._internal`.
3. **Deploy**.
4. Pestaña **Configuration → Triggers → Add trigger** → selecciona **Alexa Skills
   Kit** (te pedirá el Skill ID una vez lo tengas del paso siguiente, o puedes dejarlo
   sin restringir mientras esté en desarrollo).
5. Copia el **ARN** de la función (arriba a la derecha) — lo necesitas para el
   manifiesto de la skill.

### 2. Skill en Alexa Developer Console

1. https://developer.amazon.com/alexa/console/ask → **Create Skill**.
   - Nombre: "La Guarida de Loba" (o el que prefieras para la consola, no tiene que
     coincidir con el nombre de invocación).
   - Modelo: **Custom**.
   - Método de alojamiento: **Provision your own** (vas a usar tu propia Lambda).
2. En el editor de la skill, ve a **JSON Editor** (dentro de "Interaction Model") y
   pega el contenido de `skill-package/interactionModels/custom/es-ES.json`.
3. Ve a **Endpoint**, selecciona **AWS Lambda ARN** y pega el ARN copiado antes.
4. En **Interfaces**, activa **Audio Player** (necesario para poder reproducir audio).
5. Guarda y pulsa **Build Model**.
6. Si prefieres editar el manifiesto completo (nombre público, categoría, frases de
   ejemplo, etc.) en vez de rellenarlo a mano en la consola, puedes usar el contenido
   de `skill-package/skill.json` como referencia — solo recuerda sustituir el ARN de
   ejemplo por el real.

### 3. Probar

- **Simulador** (dentro de la propia consola, pestaña "Test", modo "Development"):
  escribe o di `abre la guarida de loba` y comprueba la respuesta.
- **Echo real**: en el móvil, app de Alexa → Skills y Juegos → pestaña "Tus Skills" →
  debería aparecer automáticamente en desarrollo si usas la misma cuenta de Amazon con
  la que creaste la skill.
- Prueba **dos escenarios**:
  1. Con la radio emitiendo en directo → debería empezar a sonar.
  2. Con la radio parada → debería decir por voz que no está emitiendo, sin sonido.

### 4. Publicar (descartado)

No se va a publicar. Lo que sigue queda como referencia por si algún día cambia la decisión.

Cuando se quiera abrir a cualquier usuario: añadir iconos de la skill (108×108 y
512×512 px), una política de privacidad, pulir las frases de ejemplo del manifiesto, y
enviarla a certificación desde la consola de Alexa Developer.

## Prueba local sin AWS

Con Node.js 20+ instalado:

```bash
node lambda/test/local-test.js
```

Hace una petición real a la web de la radio y muestra si el handler decide reproducir
(con qué URL) o responder que no está emitiendo. El resultado depende de si la emisora
está emitiendo en ese momento — para probar la rama "no está emitiendo" hay que
ejecutarlo cuando la radio esté parada.
