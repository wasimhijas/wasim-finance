const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client
  .database("wasimfinance")
  .container("kvstore");

module.exports = async function (context, req) {
  const { key, value } = req.body || {};

  if (!key) {
    context.res = { status: 400, body: { error: "Missing key" } };
    return;
  }

  try {
    await container.items.upsert({ id: key, key, value });
    context.res = { status: 200, body: { ok: true } };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};