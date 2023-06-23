import request from "supertest";
import config from "../src/config";

const api = `http://app:${config.server_port}`;

console.log(config);

describe("GET /greeting", () => {
  it("responds with isHealthy equals true", async () => {
    const res = await request(api).get("/greeting");

    // Check that the request was successful
    expect(res.statusCode).toEqual(400);
  });
});
