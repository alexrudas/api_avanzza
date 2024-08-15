const express = require("express");
const imageToText = require("./imageToText");
const wppconnect = require("@wppconnect-team/wppconnect");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const port = 3001;

app.use(express.json());

// Variables bandera para el sistema bot de whatsapp
let sessionData = null,
  sessionStatus = null,
  scannerStatus = null,
  browserInstance,
  browserInstancePerson;

// Variables para el sistema de colas para la api run unofficial vehiculos.
const queue = [],
  inProgress = new Set(),
  maxConcurrentRequests = 1;

// Variables para el sistema de colas para la api run unofficial personas.
let requestQueue = [],
  isProcessing = false;

// Funcion de tiempo de espera.
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

// Funcion para procesar la cola de api runt unofficial personas.
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const { req, res } = requestQueue.shift();
  const { license, typeDcm } = req.params;
  const requestId = `${license}-${Date.now()}`;
  const url = "https://www.runt.com.co/consultaCiudadana/#/consultaPersona";

  try {
    let scrapedData = await scrapeWebsitePerson(url, license, typeDcm);
    res.json(scrapedData);
  } catch (error) {
    console.error("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  } finally {
    isProcessing = false;
    processQueue(); // Procesa la siguiente solicitud de la cola
  }
}

// Inicializa el titiritero para la api del runt unofficial
async function initializeBrowser() {
  // Si desea ver las acciones use headless: false esto para pruebas, para produccion use headless: 'new'x
  browserInstance = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], });
  browserInstancePerson = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], });
}

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

// Funcion de scrapeo para obtener la DATA del runt
async function scrapeWebsite(url, placa, cedula, typeDcm) {
  const page = await browserInstance.newPage();
  await page.goto(url);

  await page.waitForSelector("#imgCaptcha");

  await page.type("#noPlaca", placa);
  await page.type("#noDocumento", cedula);
  const select = await page.$("#tipoDocumento");
  await select.select(typeDcm);

  const selectorElement = await page.$("#imgCaptcha");
  const screenshot = await selectorElement.screenshot();
  await fs.promises.writeFile("archivo.jpg", screenshot);

  const text = await imageToText(browserInstance, true);
  console.log("text capchat", text);
  if (text.success == false) {
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

  const panelSelector =
    "body > div:nth-child(2) > div > div.col-lg-12.ng-scope > div.col-lg-10 > div:nth-child(1) > div.content_runt > div.panel.panel-primary.main > div:nth-child(5)";
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
    SOAT: [],
    CDA: [],
    RC: []
  };

  data["PRINCIPAL"] = principal;
  data["GENERAL"] = JSON.parse(informacion);

  // INFORMACIÓN SOAT
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
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
        th.textContent.trim()
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


  // SECCIÓN TÉCNICO MECÁNICA
  startTime = Date.now();
  while (true) {
    await page.waitForSelector("#pnlRevisionTecnicoMecanicaNacional table");

    data["CDA"] = await page.evaluate(() => {
      const table = document.querySelector(
        "#pnlRevisionTecnicoMecanicaNacional table"
      );
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
  await page.close();

  return data;
}

// Funcion de procesado de colas para las peticiones de la api runt
function processRequest({ req, res, plaque, license, typeDcm, requestId }) {
  scrapeWebsite(
    "https://www.runt.gov.co/consultaCiudadana/#/consultaVehiculo",
    plaque,
    license,
    typeDcm
  )
    .then((scrapedData) => {
      res.json(scrapedData);
    })
    .catch((error) => {
      console.error("Error al realizar el scraping:", error);
      res
        .status(500)
        .json({ success: false, message: "Error interno del servidor." });
    })
    .finally(() => {
      inProgress.delete(requestId);
      if (queue.length > 0) {
        const nextRequest = queue.shift();
        inProgress.add(nextRequest.requestId);
        processRequest(nextRequest);
      }
    });
}

// FUncion de scrapeo para obtener la DATA del runt ciudadano
async function scrapeWebsitePerson(url, cedula, typeDcm) {
  const page = await browserInstancePerson.newPage();
  await page.goto(url);

  await page.waitForSelector("#imgCaptcha");

  await delay(4000);

  const select = await page.$("#input-tipo-documento");
  await select.select(typeDcm);
  await page.type("#noDocumento", cedula);

  const selectorElement = await page.$("#imgCaptcha");
  const screenshot = await selectorElement.screenshot();
  await fs.promises.writeFile("archivo-person.jpg", screenshot);

  const text = await imageToText(browserInstancePerson, false);

  if (text.success == false) {
    await page.close();
    return text;
  }

  await page.type("#captcha", text.content);
  console.log("Captchaaaaaaaaaaaa");
  await page.waitForSelector(
    "body > div:nth-child(2) > div > div > div.col-lg-10 > div > div.content_runt > div > div.panel-body > div.row > div.col-sm-9.panel-der > div > div > form > div:nth-child(4) > button"
    , { timeout: 60000 });

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
  } catch (error) { }

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
}

// Ruta para encender el bot y obtener el QR
app.get("/whatsapp/start", async (req, res) => {
  try {
    if (scannerStatus == "qrReadSuccess") {
      res.status(208).json({
        success: true,
        message:
          "La petición ya ha sido procesada anteriormente. No es necesario realizarla de nuevo.",
      });
    } else if (scannerStatus == "Scanning") {
      res.status(409).json({
        success: false,
        message:
          "El sistema actualmente está realizando un escaneo. Por favor, espere a que termine para iniciar una nueva sesión.",
      });
    } else {
      scannerStatus = "Scanning";
      sessionData = await wppconnect.create({
        session: "runtNotificationToken",
        catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
          console.log("Número de intentos para leer el código qr: ", attempts);
          res.json({ success: true, qrCode: base64Qrimg });
        },
        statusFind: (statusSession, session) => {
          sessionStatus = statusSession;
          if (statusSession == "qrReadError") {
            scannerStatus = "qrReadError";
          }

          if (statusSession == "browserClose") {
            scannerStatus = null;
            statusSession = null;
          }

          if (statusSession == "inChat") {
            scannerStatus = "qrReadSuccess";
            res.status(208).json({
              success: true,
              message:
                "La petición ya ha sido procesada anteriormente. No es necesario realizarla de nuevo.",
            });
          }
        },
      });
    }
  } catch (err) {
    console.error("Error al inicializar el cliente:", err);
    res
      .status(500)
      .json({ success: false, message: "Error al inicializar el cliente" });
  }
});

// Ruta para verificar el estado de la sesión
app.get("/whatsapp/status", async (req, res) => {
  try {
    res.json({
      success: true,
      sessionStatus,
      scannerStatus,
      message: `Estado de la sesión: ${sessionStatus} y estado de operacion: ${scannerStatus}.`,
    });
  } catch (err) {
    console.error("Error al obtener el estado de la sesión:", err);
    res.status(500).send({
      success: false,
      message: "Error al obtener el estado de la sesión",
    });
  }
});

// Ruta para logout de la sesión
app.get("/whatsapp/logout", async (req, res) => {
  try {
    const client = sessionData;
    const status = await client.getConnectionState();
    let logout = false;

    if (status == "CONNECTED") {
      client.logout();
      client.close();
      logout = true;
    }

    res.json({
      success: true,
      sessionStatus,
      scannerStatus,
      logout,
      message: `Estado de la sesión: ${sessionStatus} y estado de operacion: ${scannerStatus}.`,
    });
  } catch (err) {
    console.error("Error al hacer logout en la sesión:", err);
    res.status(500).send({
      success: false,
      message: "Error al hacer logout en la sesión",
    });
  }
});

// Ruta para enviar un mensaje a un número
app.post("/whatsapp/send", async (req, res) => {
  // Ejemplo de envio 573028353043 por number y en message: el mensaje a enviar.
  const { number, message } = req.body;

  if (!number || !message) {
    res.status(400).send({
      success: false,
      message: "Falta el número de teléfono o el mensaje",
    });
    return;
  }

  try {
    const client = sessionData;
    await client.sendText(`${number}@c.us`, message);
    res.send({ success: true, message: `Mensaje enviado a +${number}` });
  } catch (err) {
    console.error("Error al enviar el mensaje:", err);
    res
      .status(500)
      .send({ success: false, message: "Error al enviar el mensaje" });
  }
});

// Ruta para gestionar/enviar las peticiones al scrapeo
app.get("/runt/vehicle/com/:plaque/:license/:typeDcm", async (req, res) => {
  //Opciones del typeDcm son D; carnet Diplomatico, C; cedula de ciudadania, E; Cedula de extranjeria, N; Nit, P; pasaporte, U; Registro civil, T; tarjeta de identidad.
  const { plaque, license, typeDcm } = req.params;

  const requestId = `${plaque}-${license}-${Date.now()}`;
  const url = "https://www.runt.com.co/consultaCiudadana/#/consultaVehiculo";

  if (inProgress.size >= maxConcurrentRequests) {
    queue.push({ req, res, plaque, license, typeDcm, requestId });
    return;
  }

  inProgress.add(requestId);

  try {
    let scrapedData = await scrapeWebsite(url, plaque, license, typeDcm);
    res.json(scrapedData);
  } catch (error) {
    console.error("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  } finally {
    inProgress.delete(requestId);

    if (queue.length > 0) {
      const nextRequest = queue.shift();
      inProgress.add(nextRequest.requestId);
      processRequest(nextRequest);
    }
  }
});

app.get("/runt/vehicle/gov/:plaque/:license/:typeDcm", async (req, res) => {
  //Opciones del typeDcm son D; carnet Diplomatico, C; cedula de ciudadania, E; Cedula de extranjeria, N; Nit, P; pasaporte, U; Registro civil, T; tarjeta de identidad.
  const { plaque, license, typeDcm } = req.params;

  const requestId = `${plaque}-${license}-${Date.now()}`;
  const url = "https://www.runt.com.co/consultaCiudadana/#/consultaVehiculo";

  if (inProgress.size >= maxConcurrentRequests) {
    queue.push({ req, res, plaque, license, typeDcm, requestId });
    return;
  }

  inProgress.add(requestId);

  try {
    let scrapedData = await scrapeWebsite(url, plaque, license, typeDcm);
    res.json(scrapedData);
  } catch (error) {
    console.error("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  } finally {
    inProgress.delete(requestId);

    if (queue.length > 0) {
      const nextRequest = queue.shift();
      inProgress.add(nextRequest.requestId);
      processRequest(nextRequest);
    }
  }
});

app.get("/runt/person/:license/:typeDcm", (req, res) => {
  requestQueue.push({ req, res });
  processQueue();
});

initializeBrowser().then(() => {
  app.listen(port, () => {
    console.log(`Servidor Express escuchando en el puerto ${port}`);
  });
});
