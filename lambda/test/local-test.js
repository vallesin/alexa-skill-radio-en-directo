"use strict";

// Prueba local del handler sin desplegar nada en AWS.
// Uso: node lambda/test/local-test.js
// Hace una petición real a la web de la radio, así que el resultado depende de si la
// emisora está emitiendo en ese momento.

const { handler } = require("../index.js");

const launchRequestEvent = {
  version: "1.0",
  session: {
    new: true,
    sessionId: "test-session-id",
    application: { applicationId: "test-application-id" },
  },
  context: {},
  request: {
    type: "LaunchRequest",
    requestId: "test-request-launch",
    timestamp: new Date().toISOString(),
    locale: "es-ES",
  },
};

(async () => {
  console.log("=== LaunchRequest ===");
  const response = await handler(launchRequestEvent);
  console.log(JSON.stringify(response, null, 2));

  const directive = response.response.directives && response.response.directives[0];
  if (directive && directive.type === "AudioPlayer.Play") {
    console.log("\n-> La radio está EN DIRECTO. URL de stream:", directive.audioItem.stream.url);
  } else if (response.response.outputSpeech) {
    console.log("\n-> Respuesta de voz (radio no emitiendo o error):", response.response.outputSpeech.text);
  }
})();
