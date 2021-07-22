import TestClient from "./struct/TestClient.js";
const client = new TestClient();

const { token } = require("./auth.json");
client.start(token);

process.on("unhandledRejection", err => console.error(err)); // eslint-disable-line no-console
