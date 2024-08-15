const path = require("path");

async function imageToText(browser, type) {
  const page = await browser.newPage();

  try {
    await page.goto("https://www.jpgtotext.com/es/imagen-a-texto");
    await page.waitForSelector('input[type="file"]');
    const inputFile = await page.$('input[type="file"]');
    await inputFile.uploadFile(
      path.resolve(__dirname, type ? "archivo.jpg" : "archivo-person.jpg")
    );
    await page.waitForSelector("#extract-text-now");

    await page.evaluate(() => {
      const button = document.querySelector("#extract-text-now");
      if (button) {
        button.click();
      } else {
        console.error(
          'No se encontró el botón con el selector "#extract-text-now"'
        );
      }
    });

    await page.waitForSelector("textarea", { timeout: 60000 });

    await page.waitForFunction(() => {
      const textarea = document.querySelector("textarea");
      return textarea && textarea.value !== "";
    });

    const content = await page.evaluate(() => {
      const textarea = document.querySelector("textarea");
      if (textarea) {
        console.log(textarea.value);
        return textarea.value;
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
