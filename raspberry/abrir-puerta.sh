#!/bin/sh
# Abre la "puerta" del stream de La Guarida de Loba para la IP pública de esta red.
#
# El servidor del stream (listen2myradio) solo sirve audio a una IP después de que esa IP haya
# llamado a openfire.ajax.php, que es lo que hace la web de la radio al cargarse y luego cada
# 100 minutos. El Echo no puede hacerlo, pero comparte IP pública con este equipo, así que basta
# con llamar desde aquí de vez en cuando.
#
# Uso (cron, cada 30 min):  */30 * * * * /home/pi/abrir-puerta.sh >> /home/pi/abrir-puerta.log 2>&1

H=https://laguaridadelobavip.radio12345.com/
RADIO_ID=3438332
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

# 1) La home da la cookie de sesión, igual que en el navegador.
curl -s -m 20 -A "$UA" -c "$JAR" -o /dev/null "$H"
# 2) La llamada que abre el cortafuegos para nuestra IP. Responde con una URL que incluye REMOTE_ADDR.
RESP=$(curl -s -m 20 -A "$UA" -e "$H" -b "$JAR" -c "$JAR" -d '' "${H}openfire.ajax.php?radio_id=${RADIO_ID}")

IP=$(printf '%s' "$RESP" | sed -n 's/.*REMOTE_ADDR=\([^&]*\).*/\1/p')
if [ -n "$IP" ]; then
  echo "$(date '+%F %T') OK puerta abierta para $IP"
else
  echo "$(date '+%F %T') ERROR respuesta inesperada: $(printf '%s' "$RESP" | head -c 100)"
  exit 1
fi
