const cheerio = require("cheerio");
/**
 * Inicializa el escrapeo de la petición.
 *
 * @param {Object} req - El objeto de solicitud (request) de Express que contiene la información sobre la solicitud del cliente.
 * @param {Object} res - El objeto de respuesta (response) de Express que se utiliza para enviar la respuesta al cliente.
 * @param {Object} browserInstance - Variable para guardar la instancia del titiritero (puppeteer), que se usa para manejar el navegador.
 *
 * @returns {Promise<void>} - Una promesa que resuelve cuando la función ha terminado de procesar la solicitud por medio del RES.
 */
async function scrapeSimit(req, res, browserInstance) {
  try {
    const { license } = req.params;

    const response = await scrapeWebsite(license, browserInstance);

    res.json(response);
  } catch (error) {
    console.log("Error al realizar el scraping:", error);
    res
      .status(500)
      .json({ success: false, message: "Error interno del servidor.", error });
  }
}

async function scrapeWebsite(license, browserInstancePerson) {
  const page = await browserInstancePerson.newPage();
  try {
    await page.goto(
      "https://www.fcm.org.co/simit/#/estado-cuenta?numDocPlacaProp=" + license,
      {
        waitUntil: 'load',  // Espera a que la página se haya cargado completamente
        timeout: 60000      // Aumenta el timeout a 60 segundos
      }
    );

    await page.waitForSelector(
      "#mainView > div > div.container-fluid.mb-4 > div"
    );

    const htmlContent = await page.evaluate(() => {
      const element = document.querySelector(
        "#mainView > div > div.container-fluid.mb-4"
      );
      return element ? element.innerHTML : null;
    });

    let result = { success: false, content: null };

    if (htmlContent.includes('id="resumenEstadoCuenta"')) {
      result = getInfoWithStruct1(htmlContent);
    } else {
      result = getInfoWithStruct2(htmlContent);
    }

    let historial = await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find((a) =>
        a.textContent.includes("Ver historial")
      );
      return link.textContent;
    });

    await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find((a) =>
        a.textContent.includes("Ver historial")
      );
      if (link) {
        link.click();
      }
    });

    if (historial.includes("(0)")) {
      const actives = await openDetailActive(
        page,
        result.content.comparendos_activos
      );

      result.content.comparendos_activos_detail = actives;
      return result;
    }

    await page.waitForSelector("#cursosTable");

    historial = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#cursosTable tbody tr")
      );
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        return {
          comparendo: cells[0].innerText,
          fechaCurso: cells[1].innerText,
          numeroCurso: cells[2].innerText,
          ciudadRealizacion: cells[3].innerText,
          centroInstruccion: cells[4].innerText,
          fechaReporte: cells[5].innerText,
          estado: cells[6].innerText,
          certificado: cells[7].innerText,
        };
      });
    });

    result.content.historial = historial;

    await page.evaluate(() => {
      const link = [...document.querySelectorAll("a")].find((b) =>
        b.textContent.includes("Volver")
      );
      if (link) {
        link.click();
      }
    });

    await page.waitForSelector(
      "#mainView > div > div.container-fluid.mb-4 > div"
    );

    const actives = await openDetailActive(
      page,
      result.content.comparendos_activos
    );

    result.content.comparendos_activos_detail = actives;
    await page.close();
    return result;
  } catch (error) {
    await page.close();
    console.log("Error scrapping simit: ", error);
    return {
      success: false,
      message: "Error interno 500 del servidor",
      error: error,
    };
  }
}

function getInfoWithStruct1(html) {
  try {
    const $ = cheerio.load(html);

    const comparendos = $('#resumenEstadoCuenta label:contains("Comparendos")')
      .next("span")
      .text()
      .trim();
    const multas = $('#resumenEstadoCuenta label:contains("Multas")')
      .next("span")
      .text()
      .trim();
    const acuerdosDePago = $(
      '#resumenEstadoCuenta label:contains("Acuerdos de pago")'
    )
      .next("span")
      .text()
      .trim();
    const nombre = $("#resumenEstadoCuenta label")
      .filter((i, el) => $(el).text().includes("ALEX"))
      .text()
      .trim();
    const cedula = $('#resumenEstadoCuenta label:contains("Cédula")')
      .next("span")
      .text()
      .trim();
    const total = $('#resumenEstadoCuenta label:contains("Total")')
      .next("span")
      .text()
      .trim();

    const resumen = {
      comparendos,
      multas,
      acuerdosDePago,
      nombre,
      cedula,
      total,
    };

    const comparendos_activos = $("#multaTable tbody tr")
      .map((i, row) => ({
        tipo: $(row).find("td:nth-child(1) u").text().trim(),
        fechaImposicion: $(row).find("td:nth-child(1) span").text().trim(),
        notificacion: $(row).find("td:nth-child(2) span").text().trim(),
        placa: $(row).find("td:nth-child(3)").text().trim(),
        secretaria: $(row).find("td:nth-child(4)").text().trim(),
        infraccion: $(row).find("td:nth-child(5) label").text().trim(),
        estado: $(row).find("td:nth-child(6)").text().trim(),
        valor: $(row).find("td:nth-child(7)").text().trim(),
        valorAPagar: $(row).find("td:nth-child(8)").text().trim(),
        seleccionado: $(row).find("td:nth-child(9) input").is(":checked"),
      }))
      .get();

    return {
      success: true,
      content: {
        resumen,
        comparendos_activos: cleanAndOrganize(comparendos_activos),
      },
    };
  } catch (error) {
    return { success: false, content: error };
  }
}

function getInfoWithStruct2(html) {
  try {
    const $ = cheerio.load(html);

    const comparendos = $(
      '.col-md-3:has(label:contains("Comparendos")) strong'
    ).text();
    const multas = $('.col-md-3:has(label:contains("Multas")) strong').text();
    const acuerdosPago = $(
      '.col-md-3:has(label:contains("Acuerdos de pago")) strong'
    ).text();
    const total = $('.col-md-4:has(label:contains("Total")) strong').text();

    const resumen = {
      comparendos,
      multas,
      acuerdosPago,
      nombre: null,
      cedula: null,
      total,
    };

    const comparendos_activos = $("#multaTable tbody tr")
      .map((i, row) => ({
        tipo: $(row).find("td:nth-child(1) u").text().trim(),
        fechaImposicion: $(row).find("td:nth-child(1) span").text().trim(),
        notificacion: $(row).find("td:nth-child(2) span").text().trim(),
        placa: $(row).find("td:nth-child(3)").text().trim(),
        secretaria: $(row).find("td:nth-child(4)").text().trim(),
        infraccion: $(row).find("td:nth-child(5) label").text().trim(),
        estado: $(row).find("td:nth-child(6)").text().trim(),
        valor: $(row).find("td:nth-child(7)").text().trim(),
        valorAPagar: $(row).find("td:nth-child(8)").text().trim(),
        seleccionado: $(row).find("td:nth-child(9) input").is(":checked"),
      }))
      .get();

    return {
      success: true,
      content: {
        resumen,
        comparendos_activos: cleanAndOrganize(comparendos_activos),
      },
    };
  } catch (error) {
    return { success: false, content: error };
  }
}

async function openDetailActive(page, comparendos_activos) {
  let actives = [];

  page.on("console", async (msg) => {
    if (msg.text().includes("numero")) {
      const jsonMessage = JSON.parse(msg.text());
      actives.push(jsonMessage);
    }
  });

  for (const item of comparendos_activos) {
    const type = item.tipo;

    await page.evaluate((type) => {
      const link = [...document.querySelectorAll("a")].find((a) =>
        a.textContent.includes(type)
      );
      if (link) {
        link.click();
      }
    }, type);

    await waitForTextInSelector(page, "#detalleMultaDos > h6 > span", type);
    await page.evaluate(() => {
      const link = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Volver")
      );
      if (link) {
        link.click();
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return actives;
}

function cleanAndOrganize(jsonArray) {
  return jsonArray.map((item) => {
    const fechaImposicionLimpia = item.fechaImposicion
      .replace(/\s+/g, " ")
      .trim();
    const valorLimpio = item.valor.replace(/\s+/g, " ").trim();
    const valorAPagarLimpio = item.valorAPagar.replace(/\s+/g, " ").trim();

    const [monto, interes] = valorLimpio.match(/\$ \d+[\.\d+]*/g) || [
      null,
      null,
    ];

    const [
      valorTotal,
      descuentoCapital,
      intereses,
      descuentoIntereses,
      valorAdicional,
    ] = valorAPagarLimpio.match(/\$ \d+[\.\d+]*/g) || [
      null,
      null,
      null,
      null,
      null,
    ];

    return {
      tipo: item.tipo,
      fechaImposicion: fechaImposicionLimpia.replace("Fecha coactivo: ", ""),
      notificacion: item.notificacion,
      placa: item.placa,
      secretaria: item.secretaria,
      infraccion: item.infraccion,
      estado: item.estado,
      valor: {
        monto: monto,
        interes: interes,
      },
      valorAPagar: {
        valorTotal: valorTotal,
        descuentoCapital: descuentoCapital,
        intereses: intereses,
        descuentoIntereses: descuentoIntereses,
        valorAdicional: valorAdicional,
      },
      seleccionado: item.seleccionado,
    };
  });
}

async function waitForTextInSelector(page, selector, type, timeout = 30000) {
  await page.waitForFunction(
    (selector, type) => {
      const element = document.querySelector(selector);
      return element && element.innerText.includes(type);
    },
    { timeout },
    selector,
    type
  );
}

module.exports = {
  scrapeSimit,
};

//Funcion antigua para reutilizar en caso de fallo

/*function getInfoWithStruct3(html) {
  const $ = cheerio.load(html);

  const general = {
    resolucionCoactivo: $("#detalleMultaDos h6 span").text(),
    fechaCoactivo: $("#detalleMultaDos p span").text(),
    detalles: {
      resolucion: $('li:contains("Resolución") span.text-muted').text(),
      fechaResolucion: $(
        'li:contains("Fecha resolución") span.text-muted'
      ).text(),
      secretaria: $('li:contains("Secretaría") span.text-muted').text(),
      articulo: $('li:contains("Artículo") span.text-muted').text(),
      infraccion: $('li:contains("Infracción") span.text-muted').text(),
      infractor: $('li:contains("Infractor") span.text-muted').text(),
    },
  };

  const informacion_comparendo = {
    noComparendo: $('.form-group:has(label:contains("No. comparendo")) p')
      .text()
      .trim(),
    fecha: $('.form-group:has(label:contains("Fecha")) p').text().trim(),
    hora: $('.form-group:has(label:contains("Hora")) p').text().trim(),
    direccion: $('.form-group:has(label:contains("Dirección")) p')
      .text()
      .trim(),
    comparendoElectronico: $(
      '.form-group:has(label:contains("Comparendo electrónico")) p'
    )
      .text()
      .trim(),
    fechaNotificacion: $(
      '.form-group:has(label:contains("Fecha notificación")) p'
    )
      .text()
      .trim(),
    fuenteComparendo: $(
      '.form-group:has(label:contains("Fuente comparendo")) p'
    )
      .text()
      .trim(),
    secretaria: $('.form-group:has(label:contains("Secretaría")) p')
      .text()
      .trim(),
    agente: $('.form-group:has(label:contains("Agente")) p').text().trim(),
  };

  const infraccion = {
    codigo: $('.form-group:has(label:contains("Código")) p').text().trim(),
    descripcion: $('.form-group:has(label:contains("Descripción")) p')
      .text()
      .trim(),
    valor: $('.form-group:has(label:contains("Valor")) p')
      .text()
      .trim()
      .replace(/\s+/g, " "),
  };

  const conductor = {
    tipoDocumento: $('.form-group:has(label:contains("Tipo documento")) p')
      .text()
      .trim(),
    numeroDocumento: $('.form-group:has(label:contains("Número documento")) p')
      .text()
      .trim(),
    nombres: $('.form-group:has(label:contains("Nombres")) p').text().trim(),
    apellidos: $('.form-group:has(label:contains("Apellidos")) p')
      .text()
      .trim(),
    tipoInfractor: $('.form-group:has(label:contains("Tipo de infractor")) p')
      .text()
      .trim(),
  };

  const vehiculo = {
    placa: $('.form-group:has(label:contains("Placa")) p').text().trim(),
    noLicencia: $(
      '.form-group:has(label:contains("No. Licencia del vehículo")) p'
    )
      .text()
      .trim(),
    tipo: $('.form-group:has(label:contains("Tipo")) p').text().trim(),
    servicio: $('.form-group:has(label:contains("Servicio")) p').text().trim(),
  };

  const licencia = {
    noLicencia: $('.form-group:has(label:contains("No. Licencia")) p')
      .text()
      .trim(),
    fechaVencimiento: $(
      '.form-group:has(label:contains("Fecha vencimiento")) p'
    )
      .text()
      .trim(),
    categoria: $('.form-group:has(label:contains("Categoría")) p')
      .text()
      .trim(),
    secretaria: $('.form-group:has(label:contains("Secretaría")) p')
      .text()
      .trim(),
  };

  const adicional = {
    municipioComparendo: $(
      '.form-group:has(label:contains("Municipio comparendo")) p'
    )
      .text()
      .trim(),
    localidadComuna: $('.form-group:has(label:contains("Localidad comuna")) p')
      .text()
      .trim(),
    radioAccion: $('.form-group:has(label:contains("Radio acción")) p')
      .text()
      .trim(),
    modalidadTransporte: $(
      '.form-group:has(label:contains("Modalidad transporte")) p'
    )
      .text()
      .trim(),
  };

  return {
    general,
    informacion_comparendo,
    infraccion,
    conductor,
    vehiculo,
    licencia,
    adicional,
  };
}*/
