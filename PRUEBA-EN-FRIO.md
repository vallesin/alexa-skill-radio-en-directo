# Prueba en frío: ¿sigue haciendo falta la "puerta" de la Raspberry?

**Pregunta:** con la radio premium (home `laguaridadelobavip`, radio_id 3438332, stream en
`us5new.listen2myradio.com:2199`), ¿sirve el servidor audio a una IP que NO ha llamado antes a
`openfire.ajax.php`?

**Por qué hace falta la prueba:** el 04/10 el Echo sonó, pero el script se había ejecutado desde el PC
(misma IP pública, <IP-DEL-PROPIETARIO>) a las 19:20 y a las 19:44, así que la puerta estaba abierta.
Además, las pruebas con `curl -o fichero` de esa tarde no valen (un fallo de conexión dejaba el
fichero viejo y parecía éxito).

## Qué abre la puerta (hay que evitarlo todo ≥ 100 min antes)

El servidor abre la IP cuando se llama a `openfire.ajax.php` (la web lo hace al cargarse y cada 100
min). Hasta que pase ese tiempo desde la última vez, la IP de casa puede estar aún abierta. Por tanto,
desde la red de casa **no** hay que:

- ejecutar `raspberry/abrir-puerta.sh` ni dejar el cron de la Raspberry activo,
- abrir `laguaridadelobavip.radio12345.com` (ni las otras URLs de la radio, ni la app Listen2MyRadio),
- reproducir la radio en VLC ni en nada que cargue la home.

## Preparación (unas 2 h antes de la emisión)

1. **Parar el cron en la Raspberry** (<IP-DE-LA-RASPBERRY>): `crontab -e` y comentar la línea de
   `abrir-puerta.sh`. Anota la hora.
2. Cerrar en el PC y el móvil (por wifi) toda pestaña o app de la radio.
3. No tocar nada más. Esperar **al menos 100 min** desde la última apertura (la última entrada de
   `abrir-puerta.log` de la Raspberry o la última vez que se abrió la web).

## Prueba (con la emisión ya en directo)

4. **Confirmar que hay emisión sin usar la IP de casa:** que alguien (la administradora, o tu móvil con
   **datos móviles**, wifi apagada) abra la web o la app y compruebe que suena. Ojo: desde casa no.
5. **Prueba A, curl desde casa** (no abre la puerta, solo pide el audio):

   ```sh
   U=$(curl -s https://laguaridadelobavip.radio12345.com/ | grep -oE 'https://[^<"[:space:]]*listen2myradio[^<"[:space:]]*' | head -1)
   rm -f /tmp/s.bin
   curl -sv -m 6 -o /tmp/s.bin "$U" 2>&1 | grep -E 'Connected|< HTTP'; ls -la /tmp/s.bin
   ```

   Ojo: esto sí descarga la home, pero la home sola no llama a `openfire` (eso lo hace el JavaScript).
   Fíate de `/tmp/s.bin` solo si el comando lo ha creado de nuevo (por eso el `rm -f` previo).
6. **Prueba B, el Echo:** invocar la skill. Después, en CloudShell:
   `aws logs tail /aws/lambda/la-guarida-de-loba-skill --since 10m --region eu-west-1`

## Cómo leer el resultado

| Prueba A (curl) | Prueba B (Echo) | Conclusión |
|---|---|---|
| ~hundreds de KB, `audio/mpeg` | suena | **La puerta ya no hace falta.** Se puede retirar la Raspberry |
| `ICY 401` con emisión confirmada en el paso 4 | `PlaybackFailed` (`MEDIA_ERROR_INVALID_REQUEST`) | **La puerta sigue siendo necesaria.** Reactivar el cron |
| `ICY 401` y el paso 4 no confirma emisión | cualquiera | Prueba inválida (no había emisión); repetir |

## Después

- Reactivar el cron de la Raspberry (con el script nuevo: home vip e id 3438332) si la puerta hace falta.
- Anotar el resultado en este archivo y en la memoria del proyecto.
- Si la puerta ya no hace falta, la skill podría abrirse a más oyentes sin proxy con IP fija
  (revisar el plan de `PRUEBA-EMISION.md`).
