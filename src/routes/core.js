const express = require("express");
const { initializeBrowser } = require("../utils");
const { scrapePerson } = require("../controllers/person");
const { scrapeVehicle } = require("../controllers/runt");
const { scrapeSimit } = require("../controllers/simit");
const router = express.Router();

// Almacena una sola cola y su estado de procesamiento
const queue = {
  requestQueue: [],
  isProcessing: false,
};

/**
 * Procesa la cola de solicitudes de manera genérica.
 * @param {object} browserInstance - La instancia única del navegador asociada.
 */
const processQueue = async (browserInstance) => {
  if (queue.isProcessing || queue.requestQueue.length === 0) return;

  queue.isProcessing = true;

  while (queue.requestQueue.length > 0) {
    const { req, res, scrapeFunction } = queue.requestQueue.shift();
    try {
      await scrapeFunction(req, res, browserInstance);
    } catch (error) {
      res
        .status(500)
        .send({ success: false, message: "Ocurrió un error", error });
    }
  }

  queue.isProcessing = false;
};

/**
 * Inicializa las rutas dinámicamente y el navegador único asociado.
 */
async function chargeRoutesDynamic() {
  // Inicializa una sola instancia de navegador
  const browserInstance = await initializeBrowser("user_data_shared");

  // Ruta para SIMIT
  router.get("/simit/multas/:license", (req, res) => {
    queue.requestQueue.push({ req, res, scrapeFunction: scrapeSimit });
    processQueue(browserInstance);
  });

  // Ruta para personas
  router.get("/runt/person/consult/:license/:typeDcm", (req, res) => {
    queue.requestQueue.push({ req, res, scrapeFunction: scrapePerson });
    processQueue(browserInstance);
  });

  // Ruta para vehículos
  router.get("/runt/vehicle/:type/:plaque/:license/:typeDcm", (req, res) => {
    queue.requestQueue.push({ req, res, scrapeFunction: scrapeVehicle });
    processQueue(browserInstance);
  });
}

chargeRoutesDynamic();

module.exports = router;
