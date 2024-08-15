const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const imageToText = require("./imageToText");

const app = express();
const port = 3000;

let browserInstance;

async function initializeBrowser() {
  browserInstance = await puppeteer.launch({ headless: false });
}

async function scrapeWebsite(url, placa, cedula) {
  const page = await browserInstance.newPage();
  await page.goto(url);

  await page.waitForSelector("#imgCaptcha");

  await page.type("#noPlaca", placa);
  await page.type("#noDocumento", cedula);

  const selectorElement = await page.$("#imgCaptcha");
  const screenshot = await selectorElement.screenshot();
  await fs.promises.writeFile("archivo.jpg", screenshot);

  const text = await imageToText(browserInstance);

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

    console.log("Marca: " + temp);

    if (temp != "") {
      break;
    }

    if (Date.now() - startTime >= 10000) {
      break;
    }
  }

  const informacion = await page.evaluate(() => {
    const html = document
      .querySelector("#pnlInformacionGeneralVehiculo")
      .innerHTML.trim();
    let data = {};

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Obtener todos los labels y valores
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

  await page.close();

  return informacion;
}

app.get("/consult/:placa/:cedula", async (req, res) => {
  try {
    const url = "https://www.runt.com.co/consultaCiudadana/#/consultaVehiculo";
    const { placa, cedula } = req.params;
    const scrapedData = await scrapeWebsite(url, placa, cedula);
    res.json(scrapedData);
  } catch (error) {
    console.error("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor" });
  }
});

initializeBrowser().then(() => {
  app.listen(port, () => {
    console.log(`Servidor Express escuchando en el puerto ${port}`);
  });
});
