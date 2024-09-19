const path = require("path");

async function imageToText(browser, type, urlType) {
  const page = await browser.newPage();
  try {
    await page.goto("https://imagetotext.online/es");

    await page.waitForSelector("#os-card-section > div");

    // Esperar el input file
    const inputFile = await page.$('input[type="file"]');

    await inputFile.uploadFile(
      path.resolve(__dirname, type ? "archivo.jpg" : "archivo-person.jpg")
    );

    await page.waitForSelector("#submit-btn");

    await page.click("#submit-btn");

    await page.waitForSelector(
      "#result-sec > div.d-flex.align-items-center.justify-content-center.result-area > div.col-9.d-flex.flex-column.align-items-end.result-container > div > button:nth-child(1)"
    );

    const content = await getTextWithTimeout(page);

    await page.close();

    if (content) {
      return { success: true, content: content };
    } else {
      return { success: false };
    }
  } catch (err) {
    console.log(err);
    await page.close();
    return { success: false, message: err.message };
  }
}

const getTextWithTimeout = async (page, timeout = 30000) => {
  return Promise.race([
    new Promise((resolve) => {
      const checkData = () => {
        page
          .evaluate(() => {
            const data = document.querySelector("#mydata0")?.value?.trim();
            return data;
          })
          .then((data) => {
            if (data) {
              resolve(data);
            } else {
              setTimeout(checkData, 500); // Revisa cada medio segundo
            }
          });
      };
      checkData();
    }),
    new Promise(
      (_, reject) => setTimeout(() => reject(null), timeout) // Límite de tiempo
    ),
  ]);
};

module.exports = imageToText;
