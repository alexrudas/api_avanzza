const wppconnect = require("@wppconnect-team/wppconnect");
const express = require("express");
const winston = require("winston");
const router = express.Router();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

let sessionData = null,
  sessionStatus = null,
  scannerStatus = null;

// Ruta para encender el bot y obtener el QR
router.get("/start", async (req, res) => {
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
        error: "Session abierta, esperar por favor a su cierre.",
      });
    } else {
      scannerStatus = "Scanning";
      sessionData = await wppconnect.create({
        session: "runtNotificationToken",
        disableWelcome: true,
        logger: logger,
        catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
          res.json({
            success: true,
            message: "Codigo QR code cargado.",
            data: { qrCode: base64Qrimg },
          });
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
              data: null,
            });
          }
        },
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error al inicializar el cliente",
      error: err,
    });
  }
});

// Ruta para verificar el estado de la sesión
router.get("/status", async (req, res) => {
  try {
    res.json({
      success: true,
      message: `Estado de la sesión: ${sessionStatus} y estado de operacion: ${scannerStatus}.`,
      data: { sessionStatus, scannerStatus },
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Error al obtener el estado de la sesión",
      error: err,
    });
  }
});

// Ruta para logout de la sesión
router.get("/logout", async (req, res) => {
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
      message: `Estado de la sesión: ${sessionStatus} y estado de operacion: ${scannerStatus}.`,
      data: { sessionStatus, scannerStatus, logout },
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Error al hacer logout en la sesión",
      error: err,
    });
  }
});

// Ruta para enviar un mensaje a un número
router.post("/send", async (req, res) => {
  // Ejemplo de envio 573028353043 por number y en message: el mensaje a enviar.
  const { number, message } = req.body;

  if (!number || !message) {
    res.status(400).send({
      success: false,
      message: "Falta el número de teléfono o el mensaje",
      error: "No found",
    });
    return;
  }

  try {
    const client = sessionData;
    await client.sendText(`${number}@c.us`, message);
    res.send({
      success: true,
      message: `Mensaje enviado a +${number}`,
      data: null,
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Error al enviar el mensaje",
      error: err,
    });
  }
});

module.exports = router;
