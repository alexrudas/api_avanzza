const express = require("express");
const { initializeBrowser } = require("../utils");
const { scrapeSimit } = require("../controllers/simit");
const router = express.Router();

// Almacena las colas y estados de procesamiento en un solo objeto
const queues = {
  com: { requestQueue: [], isProcessing: false, scrapeFunction: scrapeSimit },
};

/**
 * Procesa la cola de solicitudes de manera genérica.
 * @param {string} type - El tipo de cola ("com" o "gov").
 * @param {object} browserInstance - La instancia del navegador asociada.
 */
const processQueue = async (type, browserInstance) => {
  const queue = queues[type];

  if (queue.isProcessing || queue.requestQueue.length === 0) {
    return; // Si ya hay un proceso en curso o la cola está vacía, no hace nada
  }

  queue.isProcessing = true; // Marca que se está procesando una solicitud

  while (queue.requestQueue.length > 0) {
    const { req, res } = queue.requestQueue.shift(); // Saca la primera solicitud de la cola
    try {
      await queue.scrapeFunction(req, res, browserInstance); // Llama la función de scrapeo correspondiente
    } catch (error) {
      res
        .status(500)
        .send({ success: false, message: "Ocurrió un error", error: error });
    }
  }

  queue.isProcessing = false; // Marca que ya terminó el procesamiento
};

/**
 * Inicializa las rutas dinámicamente y los navegadores asociados.
 */
async function chargeRoutesDynamic() {
  // Inicializa los navegadores concurrentemente
  const [browserInstanceCom] = await Promise.all([
    initializeBrowser("user_data_5"),
  ]);

  // Rutas para vehículos comerciales
  router.get("/multas/:license", (req, res) => {
    queues.com.requestQueue.push({ req, res });
    processQueue("com", browserInstanceCom);
  });
}

chargeRoutesDynamic();

module.exports = router;
