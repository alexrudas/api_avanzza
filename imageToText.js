const path = require("path");

async function imageToText(browser, type, urlType) {
  const page = await browser.newPage();

  try {
    await page.goto("https://www.jpgtotext.com/es/imagen-a-texto");
    const inputFile = await page.waitForSelector("#file");

    await inputFile.uploadFile(
      path.resolve(__dirname, type ? "archivo.jpg" : "archivo-person.jpg")
    );
    await page.waitForSelector("#extract-btn");
    await page.click("#extract-btn");

    await page.evaluate(() => {
      const button = document.querySelector("#extract-btn");
      if (button) {
        button.click();
      } else {
        console.log(
          'No se encontró el botón con el selector "#extract-text-now"'
        );
      }
    });

    await page.waitForSelector("#text_area_0");

    await page.waitForFunction(() => {
      const textarea = document.querySelector("#text_area_0");
      return textarea && textarea.textContent !== "";
    });

    const content = await page.evaluate(() => {
      const textarea = document.querySelector("#text_area_0");
      if (textarea) {
        return textarea.textContent;
      } else {
        return "";
      }
    });

    if (content == "") {
      return {
        success: false,
        message:
          "Se solicita la inclusión de una representación visual más detallada que permita una mejor apreciación de los datos proporcionados.",
      };
    }
    await page.close();

    return { success: true, content: content.trim() };
  } catch (err) {
    console.log(err);
    await page.close();
    return { success: false, message: err.message };
  }
}

module.exports = imageToText;
