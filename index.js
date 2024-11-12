const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/info", (req, res) => {
  res.json({
    success: true,
    message: "Api Runt UnOfficial with addons.",
    data: null,
  });
});

app.use("/", require("./src/routes/core"));


/*app.use("/whatsapp", require("./src/routes/whatsapp"));
app.use("/runt", require("./src/routes/runt"));
app.use("/person", require("./src/routes/person"));
app.use("/simit", require("./src/routes/simit"));*/

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
