import request from "supertest";
import { Server } from "http";
import app from "../src/main";

describe("Testing the Express/TRPC server", () => {
  let server: Server;

  beforeAll(() => {
    server = app.listen();
  });

  afterAll((done) => {
    server.close(done);
  });

  describe("GET /greeting", () => {
    it("responds with isHealthy equals true", async () => {
      const res = await request(server).get("/greeting");

      // Check that the request was successful
      expect(res.statusCode).toEqual(200);
    });
  });
});
