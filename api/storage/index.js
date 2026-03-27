const { CosmosClient } = require("@azure/cosmos");

let container;

function getContainer() {
  if (!container) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("COSMOS_CONNECTION_STRING environment variable is not set.");
    }
    const client = new CosmosClient(connectionString);
    container = client.database("financedb").container("storage");
  }
  return container;
}

module.exports = async function (context, req) {
  context.res = {
    headers: { "Content-Type": "application/json" },
  };

  try {
    const c = getContainer();

    // GET /api/storage?key=someKey
    if (req.method === "GET") {
      const key = req.query.key;
      if (!key) {
        context.res.status = 400;
        context.res.body = JSON.stringify({ error: "Missing key" });
        return;
      }
      try {
        const { resource } = await c.item(key, key).read();
        context.res.body = JSON.stringify({ value: resource?.value ?? null });
      } catch (e) {
        // Item not found — return null, not an error
        context.res.body = JSON.stringify({ value: null });
      }
      return;
    }

    // POST /api/storage  { key, value }
    if (req.method === "POST") {
      const { key, value } = req.body || {};
      if (!key) {
        context.res.status = 400;
        context.res.body = JSON.stringify({ error: "Missing key" });
        return;
      }
      await c.items.upsert({ id: key, key, value });
      context.res.body = JSON.stringify({ ok: true });
      return;
    }

    context.res.status = 405;
    context.res.body = JSON.stringify({ error: "Method not allowed" });

  } catch (err) {
    context.log.error("Storage function error:", err.message);
    context.res.status = 500;
    context.res.body = JSON.stringify({ error: err.message });
  }
};
