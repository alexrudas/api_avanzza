require("dotenv").config();

const path = require("path");
const puppeteer = require("puppeteer");
const debug = process.env.DEBUG || false;

/**
 * Inicializa una instancia del titiritero para realizar scrapping dinámico.
 * @param {Object} folder Variable para pasar la ruta del userDataDir para guardar cache y mejorar las consultas.
 * @returns {Object} La instancia del navegador ya iniciada.
 */
async function initializeBrowser(folder) {
  const userDataDir = path.resolve(__dirname, "temp", folder);
  // Si desea ver las acciones use headless: false esto para pruebas, para produccion use headless: 'new'
  const headless = debug == "false" ? "new" : false;
  browserInstance = await puppeteer.launch({
    headless: headless,
    userDataDir: userDataDir,
    args: ['--no-sandbox'],
  });
  return browserInstance;
}

/**
 * Funcion para retrasar el codigo en el scrapeo.
 * @param {Object} time Tiempo el cual se desea retrasar para que termine de cargar una accion del titiritero.
 */
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

function ocrMethod(imagePath) {
  Tesseract.recognize(imagePath, "eng", {
    tessedit_char_whitelist:
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    logger: (m) => console.log(m),
  }).then(({ data: { text } }) => {
    return text;
  });
}

module.exports = {
  initializeBrowser,
  delay,
  ocrMethod,
};
