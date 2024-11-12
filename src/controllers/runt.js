const { API_URL_COM_VEHICLE, API_URL_GOV_VEHICLE } = require("../constants");
const fs = require("fs");
const imageToText = require("./imageToText");
const { delay } = require("../utils");
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
async function scrapeVehicle(req, res, browserInstance) {
  try {
    const { plaque, license, typeDcm } = req.params;
    const type = req._parsedUrl.href.includes("com") ? "com" : "gov";
    const url = req._parsedUrl.href.includes("com")
      ? API_URL_COM_VEHICLE
      : API_URL_GOV_VEHICLE;

    let response = await scrapeWebsite(
      url,
      plaque,
      license,
      typeDcm,
      type,
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

/**
 * Funcion de scrapeo para obtener la DATA del runt de la ruta correspondiente.
 * @param {Object} url - Url para hacer el web scrapping al RUNT.
 * @param {Object} placa - Placa del vehiculo para el web scrapping runt.
 * @param {Object} cedula - Cedula del propietario del vehiculo para web scrapping.
 * @param {Object} typeDcm - Opciones del typeDcm son D; carnet Diplomatico, C; cedula de ciudadania, E; Cedula de extranjeria, N; Nit, P; pasaporte, U; Registro civil, T; tarjeta de identidad.
 * @param {Object} type - Tipo de url si es la gov o com.
 * @param {Object} browserInstance - Instancia del navegador (titiritero) para hacer el web scrapping.
 *
 * @returns {Promise<void>} - Una promesa que resuelve cuando la función ha terminado de procesar la solicitud por medio del RES.
 */
async function scrapeWebsite(
  url,
  placa,
  cedula,
  typeDcm,
  type,
  browserInstance
) {
  try {
    const page = await browserInstance.newPage();
    await page.goto(url);

    await delay(3000);
    await page.waitForSelector("#imgCaptcha");

    await page.type("#noPlaca", placa);
    await page.type("#noDocumento", cedula);
    const select = await page.$("#tipoDocumento");
    await select.select(typeDcm);

    const selectorElement = await page.$("#imgCaptcha");
    const screenshot = await selectorElement.screenshot();
    await fs.promises.writeFile(`archivo${type}.jpg`, screenshot);

    const text = await imageToTextV2(browserInstance, true, type);

    if (text.success == false) {
      await page.close();
      return text;
    }

    await page.type("#captchatxt", text.content);

    await page.waitForSelector(
      "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(3) > div.col-sm-9.panel-der > div > div > form > div:nth-child(9) > button"
    );

    await page.click(
      "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(3) > div.col-sm-9.panel-der > div > div > form > div:nth-child(9) > button"
    );

    await page.waitForSelector("#pnlInformacionGeneralVehiculo");

    let startTime = Date.now();

    while (true) {
      const temp = await page.evaluate(() => {
        return document
          .querySelector(
            "#pnlInformacionGeneralVehiculo > div > div > div > div:nth-child(1) > div:nth-child(2)"
          )
          .textContent.trim();
      });

      if (temp != "") {
        break;
      }

      if (Date.now() - startTime >= 10000) {
        break;
      }
    }

    const principal = await extractDataGeneral(page);

    const informacion = await page.evaluate(() => {
      const html = document
        .querySelector("#pnlInformacionGeneralVehiculo")
        .innerHTML.trim();
      let data = {};

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const labels = Array.from(
        doc.querySelectorAll(".col-xs-12.col-md-3.col-sm-3 label")
      );
      const values = Array.from(
        doc.querySelectorAll(
          ".col-xs-12.col-md-3.col-sm-3.show-grande.ng-binding"
        )
      );

      labels.forEach((label, index) => {
        const key = label.textContent.trim().replace(/:$/, "");
        const value = values[index].textContent.trim();
        data[key] = value;
      });

      return JSON.stringify(data, null, 2);
    });
    await page.waitForSelector(
      "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div:nth-child(5) > div.panel-heading"
    );
    await page.evaluate(() => {
      $(
        "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div:nth-child(4) > div.panel-heading"
      ).click();

      $(
        "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div:nth-child(5) > div.panel-heading"
      ).click();

      $(
        "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div:nth-child(7) > div.panel-heading"
      ).click();

      $(
        "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div:nth-child(6) > div.panel-heading > h4 > a"
      ).click();
    });

    let data = {
      PRINCIPAL: [],
      GENERAL: [],
      DATOSTECNICOS: [],
      SOAT: [],
      CDA: [],
      RC: []
    };

    data["PRINCIPAL"] = principal;
    data["GENERAL"] = JSON.parse(informacion);


    startTime = Date.now();
    while (true) {
      await page.waitForSelector("#pnlPolizaSoatNacional table");

      startTime = Date.now();
      while (true) {
        await page.waitForSelector("#pnlPolizaSoatNacional table");

        const tableHTML = await page.evaluate(() => {
          return document.querySelector("#pnlPolizaSoatNacional table").outerHTML;
        });

        data["SOAT"] = await page.evaluate((tableHTML) => {
          const table = new DOMParser()
            .parseFromString(tableHTML, "text/html")
            .querySelector("table");
          const rows = Array.from(table.querySelectorAll("tbody tr"));
          const headers = Array.from(table.querySelectorAll("thead th")).map(
            (th) => th.textContent.trim()
          );

          return rows.map((row) => {
            const rowData = {};
            Array.from(row.querySelectorAll("td")).forEach((cell, index) => {
              rowData[headers[index]] = cell.textContent.trim();
            });
            return rowData;
          });
        }, tableHTML);

        if (data["SOAT"].length != 0) {
          break;
        }

        if (Date.now() - startTime >= 10000) {
          break;
        }
      }

      startTime = Date.now();
      while (true) {
        await page.waitForSelector("#pnlRevisionTecnicoMecanicaNacional table");

        data["CDA"] = await page.evaluate(() => {
          const table = document.querySelector(
            "#pnlRevisionTecnicoMecanicaNacional table"
          );
          const rows = Array.from(table.querySelectorAll("tbody tr"));

          const headers = Array.from(table.querySelectorAll("thead th")).map(
            (th) => th.textContent.trim()
          );

          return rows.map((row) => {
            const rowData = {};
            const cells = Array.from(row.querySelectorAll("td"));
            cells.forEach((cell, index) => {
              rowData[headers[index]] = cell.textContent.trim();
            });
            return rowData;
          });
        });

        if (data["CDA"].length != 0) {
          break;
        }

        if (Date.now() - startTime >= 10000) {
          break;
        }
      }

      // SECCIÓN RCA
      startTime = Date.now();
      while (true) {
        await page.waitForSelector("#pnlPolizaResponsabilidadCivil table");

        const tableHTML = await page.evaluate(() => {
          return document.querySelector("#pnlPolizaResponsabilidadCivil table").outerHTML;
        });
        data["RC"] = await page.evaluate((tableHTML) => {
          const table = new DOMParser()
            .parseFromString(tableHTML, "text/html")
            .querySelector("table");
          const rows = Array.from(table.querySelectorAll("tbody tr"));
          const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
            th.textContent.trim()
          );

          return rows.map((row) => {
            const rowData = {};
            const cells = Array.from(row.querySelectorAll("td"));
            cells.forEach((cell, index) => {
              rowData[headers[index]] = cell.textContent.trim();
            });
            return rowData;
          });
        }, tableHTML);

        if (data["RC"].length != 0) {
          break;
        }

        if (Date.now() - startTime >= 10000) {
          break;
        }

      }
      console.log("[scrapeWebsite] [RCA] [", placa, "]");

      startTime = Date.now();
      while (true) {
        await page.waitForSelector("#pnlDatosTecnicos");
        data["DATOSTECNICOS"] = await page.evaluate(() => {

          const html = document
            .querySelector("#pnlDatosTecnicos")
            .innerHTML.trim();
          let data = {};

          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");

          const labels = Array.from(
            doc.querySelectorAll(".col-xs-12.col-md-3.col-sm-3 label")
          );
          const values = Array.from(
            doc.querySelectorAll(
              ".col-xs-12.col-md-3.col-sm-3.show-grande.ng-binding"
            )
          );

          labels.forEach((label, index) => {
            const key = label.textContent.trim().replace(/:$/, "");
            const value = values[index].textContent.trim();
            data[key] = value;
          });

          return JSON.parse(JSON.stringify(data, null, 2));
        });

        if (data["DATOSTECNICOS"].length != 0) {
          break;
        }

        if (Date.now() - startTime >= 10000) {
          break;
        }
      }

      await page.close();

      return data;
    }

    /**
     *Funcion de extraccion general para completar el scrapeo del runt.
     * @param {Object} page - Instancia de la pestaña del navegador abierto y en cuestion.
     *
     * @returns {Promise<Data>} - Retorna un objeto data que tiene placa, licencia, tipo, estado y clase; todo esto para completar la informacion scrapeada de la web del runt.
     */
    async function extractDataGeneral(page) {
      return await page.evaluate(() => {
        let data = {
          placa: "",
          licencia: "",
          tipo: "",
          estado: "",
          clase: "",
        };

        data.placa = $(
          "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5) > div.panel-body.panel-collapse > div > div:nth-child(1) > div:nth-child(2)"
        )
          .text()
          .trim();

        data.licencia = $(
          "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5) > div.panel-body.panel-collapse > div > div:nth-child(2) > div:nth-child(2)"
        )
          .text()
          .trim();

        data.tipo = $(
          "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5) > div.panel-body.panel-collapse > div > div:nth-child(3) > div.col-xs-12.col-md-3.col-sm-3.show-grande.ng-scope.ng-binding"
        )
          .text()
          .trim();

        data.estado = $(
          "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5) > div.panel-body.panel-collapse > div > div:nth-child(2) > div:nth-child(4)"
        )
          .text()
          .trim();

        data.clase = $(
          "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5) > div.panel-body.panel-collapse > div > div:nth-child(3) > div:nth-child(4)"
        )
          .text()
          .trim();

        return data;
      });
    }
  } catch (e) {

  }
}


module.exports = {
  scrapeVehicle,
};
