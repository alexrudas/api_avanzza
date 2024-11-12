const { API_URL_GOV_PERSON, API_URL_COM_PERSON } = require("../constants");
const { delay } = require("../utils");
const imageToText = require("./imageToText");
const fs = require("fs");
const imageToTextV2 = require("./imageToTextV2");

/**
 * Inicializa el escrapeo de la petición.
 *
 * @param {Object} req - El objeto de solicitud (request) de Express que contiene la información sobre la solicitud del cliente.
 * @param {Object} res - El objeto de respuesta (response) de Express que se utiliza para enviar la respuesta al cliente.
 * @param {Object} browserInstance - Variable para guardar la instancia del titiritero (puppeteer), que se usa para manejar el navegador.
 *
 * @returns {Promise<void>} - Una promesa que resuelve cuando la función ha terminado de procesar la solicitud por medio del RES.
 */
async function scrapePerson(req, res, browserInstance) {
  try {
    const { license, typeDcm } = req.params;

    const url = req._parsedUrl.href.includes("com")
      ? API_URL_COM_PERSON
      : API_URL_GOV_PERSON;

    const response = await scrapeWebsite(
      url,
      license,
      typeDcm,
      browserInstance
    );

    res.json(response);
  } catch (error) {
    console.log("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor.", error });
  }
}

async function scrapeWebsite(url, cedula, typeDcm, browserInstancePerson) {
  const page = await browserInstancePerson.newPage();
  await page.goto(url);
  const type = url.includes("gov") ? "gov" : "com";

  try {
    await page.waitForSelector("#imgCaptcha");

    await delay(4000);

    const select = await page.$("#input-tipo-documento");
    await select.select(typeDcm);
    await page.type("#noDocumento", cedula);

    const selectorElement = await page.$("#imgCaptcha");
    const screenshot = await selectorElement.screenshot();
    await fs.promises.writeFile(`archivo-person-${type}.jpg`, screenshot);

    const text = await imageToTextV2(browserInstancePerson, false, type);

    if (text.success == false) {
      await page.close();
      return text;
    }

    await page.type("#captcha", text.content);

    await page.waitForSelector(
      "body > div:nth-child(2) > div > div > div.col-lg-10 > div > div.content_runt > div > div.panel-body > div.row > div.col-sm-9.panel-der > div > div > form > div:nth-child(4) > button"
    );

    await page.click(
      "body > div:nth-child(2) > div > div > div.col-lg-10 > div > div.content_runt > div > div.panel-body > div.row > div.col-sm-9.panel-der > div > div > form > div:nth-child(4) > button"
    );

    let startTime = Date.now();

    try {
      let res = "";
      await page.waitForSelector("#dlgConsulta", { timeout: 5000 });

      startTime = Date.now();
      while (true) {
        res = await page.evaluate(() => {
          return document
            .querySelector("#dlgConsulta > div > div > div.modal-body > span")
            .textContent.trim();
        });

        if (Date.now() - startTime >= 5000) {
          break;
        }

        if (res != "") {
          await page.close();
          return { success: false, message: res };
        }
      }
    } catch (error) {}

    let data = {
      GENERAL: [],
      LICENCIAS: [],
      MULTAS: [],
      PAGOS: [],
    };

    startTime = Date.now();

    while (true) {
      data["GENERAL"] = await page.evaluate(() => {
        const rows = document.querySelectorAll(
          "body > div:nth-child(2) > div > div > div.col-lg-10 > div > div.content_runt > div > div.panel-body > div:nth-child(5) > div"
        );
        const jsonData = {};

        rows.forEach((row) => {
          const labels = row.querySelectorAll("label");
          const values = row.querySelectorAll(".show-grande.ng-binding");

          labels.forEach((label, index) => {
            const key = label.textContent
              .trim()
              .toLowerCase()
              .replace(/ /g, "_")
              .replace(/:$/, "");
            const value = values[index] ? values[index].textContent.trim() : "";
            jsonData[key] = value;
          });
        });

        return jsonData;
      });

      if (data.length != 0 && data["GENERAL"]["estado_de_la_persona"] != "") {
        break;
      }

      if (Date.now() - startTime >= 10000) {
        break;
      }
    }

    await page.click("#accordion > div:nth-child(1) > div.panel-heading");
    startTime = Date.now();
    while (true) {
      await page.waitForSelector(
        "#pnlInformacionLicencias > div > div > table > tbody"
      );

      data["LICENCIAS"] = await page.evaluate(() => {
        // Seleccionar las filas principales de la tabla (licencias)
        const mainRows = document.querySelectorAll(
          "tbody > tr.ng-scope[ng-repeat-start]"
        );

        const licenses = [];

        // Iterar sobre cada fila principal de la licencia
        mainRows.forEach((mainRow) => {
          const license = {};
          const columns = mainRow.querySelectorAll("td");

          // Extraer la información principal de la licencia
          license.number = columns[0].innerText.trim();
          license.issuer = columns[1].innerText.trim();
          license.issueDate = columns[2].innerText.trim();
          license.status = columns[3].innerText.trim();
          license.restrictions = columns[4].innerText.trim();

          // Inicializar el array de detalles
          license.details = [];

          // Buscar la fila de detalles correspondiente
          const detailRow = mainRow.nextElementSibling;
          if (detailRow && detailRow.querySelector("div.panel-body")) {
            const detailTableRows = detailRow.querySelectorAll(
              "tbody > tr.ng-scope"
            );

            // Extraer cada detalle de la licencia
            detailTableRows.forEach((detailRow) => {
              const detail = {};
              const detailColumns = detailRow.querySelectorAll("td");

              detail.category = detailColumns[0].innerText.trim();
              detail.issueDate = detailColumns[1].innerText.trim();
              detail.expiryDate = detailColumns[2].innerText.trim();
              detail.oldCategory = detailColumns[3].innerText.trim();

              license.details.push(detail);
            });
          }

          licenses.push(license);
        });

        // Convertir el array de licencias a JSON y mostrarlo en la consola
        return licenses;
      });

      if (data["LICENCIAS"].length != 0) {
        break;
      }

      if (Date.now() - startTime >= 10000) {
        break;
      }
    }

    await page.click("#accordion > div:nth-child(2) > div.panel-heading");
    startTime = Date.now();
    while (true) {
      data["MULTAS"] = await page.evaluate(() => {
        var elements = document.querySelectorAll(
          "#pnlInformacionInfracciones > div > div > div > .col-xs-12"
        );

        var jsonData = {};

        for (var i = 0; i < elements.length; i += 2) {
          var label = elements[i].textContent.trim();
          var value = elements[i + 1].textContent.trim();

          jsonData[label] = value;
        }

        return jsonData;
      });

      if (
        data["MULTAS"].length != 0 &&
        data["MULTAS"]["Tiene multas o infracciones:"] != ""
      ) {
        break;
      }

      if (Date.now() - startTime >= 10000) {
        break;
      }
    }

    await page.click("#accordion > div:nth-child(5) > div.panel-heading");
    startTime = Date.now();
    while (true) {
      data["PAGOS"] = await page.evaluate(() => {
        var table = document.querySelector(
          "#pnlInformacionPagosANSV > div > div > table"
        );

        var headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
          th.textContent.trim()
        );

        var dataRows = Array.from(table.querySelectorAll("tbody tr")).map(
          (row) => {
            var rowData = {};
            Array.from(row.querySelectorAll("td")).forEach((td, index) => {
              rowData[headers[index]] = td.textContent.trim();
            });
            return rowData;
          }
        );

        var jsonData = dataRows;

        return jsonData;
      });

      if (data["PAGOS"].length != 0) {
        break;
      }

      if (Date.now() - startTime >= 10000) {
        break;
      }
    }

    await page.close();

    return data;
  } catch (error) {
    await page.close();
    console.log("Error en persona: ", error);
    return {
      success: false,
      message: "Error interno 500 del servidor",
      error: error,
    };
  }
}

module.exports = {
  scrapePerson,
};
