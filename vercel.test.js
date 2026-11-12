const assert = require("node:assert/strict");
const {test} = require("node:test");
const handler = require("./api/[...path]");

test("Vercel API reports missing database configuration", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const response = {
    headers: {},
    writeHead(status, headers){
      this.status = status;
      this.headers = headers;
    },
    end(body){
      this.body = body;
    },
  };

  try{
    await handler({method: "GET", url: "/api/health", headers: {}}, response);
    assert.equal(response.status, 503);
    assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
    assert.match(JSON.parse(response.body).message, /DATABASE_URL/);
  } finally{
    if(originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
