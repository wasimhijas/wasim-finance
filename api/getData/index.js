const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client
  .database("wasimfinance")
  .container("kvstore");

module.exports = async function (context, req) {
  const key = req.query.key;

  if (!key) {
    context.res = { status: 400, body: { error: "Missing key" } };
    return;
  }

  try {
    const { resource } = await container.item(key, key).read();
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { key, value: resource?.value ?? null },
    };
  } catch (err) {
    if (err.code === 404) {
      // Key doesn't exist yet — return null value, not an error
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { key, value: null },
      };
    } else {
      context.res = { status: 500, body: { error: err.message } };
    }
  }
};