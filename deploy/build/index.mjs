
// Skill de Alexa para "La Guarida de Loba" (https://laguaridadeloba.radio12345.com/).
// Sin dependencias externas: usa el `fetch` nativo de Node.js 20.x en Lambda.
// La radio emite de forma intermitente y la URL del stream cambia en cada carga de la
// home, así que en cada invocación se relee la home para saber si está emitiendo.

const HOME_URL = "https://laguaridadelobavip.radio12345.com/";
const STREAM_URL_REGEX = /id="urladdress">([^<]*)<\/div>/;
const HOME_FETCH_TIMEOUT_MS = 5000;
// URL del stream real cuando la radio está en directo (dominio de listen2myradio.com,
// el proveedor real detrás de radio12345.com). Cuando NO está emitiendo, la home apunta
// a un MP3 de relleno en otro dominio (p.ej. https://fdsfdsfdsf.radio12345.com/intro.mp3),
// que no coincide con este patrón.
const LIVE_STREAM_URL_PATTERN = /^https:\/\/[^/]+\.listen2myradio\.com(:\d+)?\/live\.mp3\?typeportmount=/;
const LIVE_STREAM_TOKEN = "guarida-de-loba-live";
// El mount de listen2myradio corta en seco de forma intermitente (confirmado a mano:
// la misma URL, sin cambiar nada, unas veces devuelve audio real y otras un HTML vacío
// de 1 byte). No es un problema de esta skill ni de cabeceras/IP, así que ante un fallo
// de reproducción simplemente se reintenta un par de veces con una URL fresca.
const MAX_PLAYBACK_RETRIES = 2;

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Devuelve { live: true, url } si la radio está emitiendo ahora mismo,
// { live: false, error: null } si la radio no está emitiendo,
// o { live: false, error: <mensaje> } si la propia comprobación ha fallado
// (red caída, HTML cambiado, etc. — distinto de "no está emitiendo").
//
// No se hace fetch al propio stream para comprobar el audio: el mount de
// listen2myradio corta en seco de forma intermitente (la misma URL, sin cambiar
// nada, unas veces sirve audio real y otras un HTML vacío de 1 byte, visto tanto
// desde esta Lambda como desde un navegador normal), así que ese check no sería
// fiable y solo añadiría latencia. En su lugar, se confía en si la URL de la home
// tiene la forma del stream real de listen2myradio.com, y el reintento en
// AudioPlayer.PlaybackFailed cubre el caso de que justo entonces esté cortada.
async function checkLiveStream() {
  const startedAt = Date.now();
  const result = await fetchLiveStreamStatus();
  // Una línea JSON por comprobación, para poder cazar en CloudWatch qué vio la Lambda
  // (sin el query string de la URL, que lleva el token del stream).
  console.log(
    JSON.stringify({
      evt: "checkLiveStream",
      live: result.live,
      error: result.error || null,
      stream: result.live ? result.url.replace(/\?.*$/, "") : null,
      ms: Date.now() - startedAt,
    })
  );
  return result;
}

async function fetchLiveStreamStatus() {
  try {
    const homeResponse = await fetchWithTimeout(HOME_URL, HOME_FETCH_TIMEOUT_MS);
    const html = await homeResponse.text();
    const match = html.match(STREAM_URL_REGEX);
    if (!match) {
      return { live: false, error: "no se encontró la URL del stream en la home" };
    }
    const streamUrl = match[1].trim();
    if (!streamUrl) {
      // Sin URL de stream en la home: la radio no está emitiendo (no es un error).
      return { live: false, error: null };
    }
    if (!LIVE_STREAM_URL_PATTERN.test(streamUrl)) {
      // No coincide con el patrón del stream real (p.ej. es el MP3 de relleno
      // fdsfdsfdsf.radio12345.com/intro.mp3): la radio no está emitiendo.
      return { live: false, error: null };
    }
    // El servidor solo sirve por el puerto que trae la URL (2199); el 443 rechaza conexiones.
    return { live: true, url: streamUrl };
  } catch (err) {
    console.error("Error comprobando la home de la radio", err);
    return { live: false, error: err.message || "fallo al leer la home de la radio" };
  }
}

function buildPlayDirective(url, retryCount = 0) {
  return {
    type: "AudioPlayer.Play",
    playBehavior: "REPLACE_ALL",
    audioItem: {
      stream: {
        token: `${LIVE_STREAM_TOKEN}:retry${retryCount}`,
        url,
        offsetInMilliseconds: 0,
      },
    },
  };
}

function getRetryCountFromToken(token) {
  const match = typeof token === "string" && token.match(/:retry(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildStopDirective() {
  return { type: "AudioPlayer.Stop" };
}

function speechResponse(text, { shouldEndSession = true, directives } = {}) {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      shouldEndSession,
      ...(directives ? { directives } : {}),
    },
  };
}

function directiveOnlyResponse(directives) {
  return {
    version: "1.0",
    response: {
      directives,
      shouldEndSession: true,
    },
  };
}

function emptyResponse() {
  return { version: "1.0", response: {} };
}

async function handlePlay() {
  const result = await checkLiveStream();
  if (result.live) {
    return directiveOnlyResponse([buildPlayDirective(result.url)]);
  }
  if (result.error) {
    return speechResponse(
      "No he podido comprobar si la Guarida de Loba está emitiendo ahora mismo. Inténtalo de nuevo en unos minutos."
    );
  }
  return speechResponse(
    "La Guarida de Loba no está emitiendo en directo ahora mismo. Vuelve a intentarlo más tarde."
  );
}

async function handleIntentRequest(intent) {
  switch (intent.name) {
    case "PlayRadioIntent":
    case "AMAZON.ResumeIntent":
      return handlePlay();
    case "AMAZON.PauseIntent":
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return speechResponse("Hasta pronto, aúlla cuando quieras volver a la Guarida de Loba.", {
        directives: [buildStopDirective()],
      });
    case "AMAZON.HelpIntent":
      return speechResponse(
        "Puedes decir 'pon la guarida de loba' para escuchar la radio en directo si está emitiendo ahora mismo.",
        { shouldEndSession: false }
      );
    case "AMAZON.FallbackIntent":
    default:
      return speechResponse("No te he entendido. Puedes decir: pon la guarida de loba.", {
        shouldEndSession: false,
      });
  }
}

async function handleAudioPlayerRequest(request) {
  if (request.type === "AudioPlayer.PlaybackFailed") {
    console.error("AudioPlayer.PlaybackFailed", JSON.stringify(request.error || {}));
    const retryCount = getRetryCountFromToken(request.token);
    if (retryCount < MAX_PLAYBACK_RETRIES) {
      const result = await checkLiveStream();
      if (result.live) {
        return directiveOnlyResponse([buildPlayDirective(result.url, retryCount + 1)]);
      }
    }
  }
  // Alexa no permite outputSpeech en respuesta a eventos de AudioPlayer.
  return emptyResponse();
}

async function handlePlaybackControllerRequest(request) {
  // Igual que con AudioPlayer: sin outputSpeech, solo directivas.
  if (request.type === "PlaybackController.PlayCommandIssued") {
    const result = await checkLiveStream();
    if (result.live) {
      return directiveOnlyResponse([buildPlayDirective(result.url)]);
    }
    return emptyResponse();
  }
  if (request.type === "PlaybackController.PauseCommandIssued") {
    return directiveOnlyResponse([buildStopDirective()]);
  }
  return emptyResponse();
}

export const handler = async (event) => {
  try {
    const request = event.request;
    console.log(
      JSON.stringify({
        evt: "request",
        type: request.type,
        intent: request.intent && request.intent.name,
        retry: request.token ? getRetryCountFromToken(request.token) : undefined,
        offsetMs: request.offsetInMilliseconds,
      })
    );
    if (request.type === "LaunchRequest") {
      return await handlePlay();
    }
    if (request.type === "IntentRequest") {
      return await handleIntentRequest(request.intent);
    }
    if (request.type === "SessionEndedRequest") {
      return emptyResponse();
    }
    if (request.type.startsWith("AudioPlayer.")) {
      return await handleAudioPlayerRequest(request);
    }
    if (request.type.startsWith("PlaybackController.")) {
      return await handlePlaybackControllerRequest(request);
    }
    return emptyResponse();
  } catch (err) {
    console.error("Error inesperado en el handler", err);
    return speechResponse(
      "Ha ocurrido un error inesperado en la Guarida de Loba. Inténtalo de nuevo en un momento."
    );
  }
};

// Exportado solo para el arnés de pruebas local (lambda/test/local-test.js).
