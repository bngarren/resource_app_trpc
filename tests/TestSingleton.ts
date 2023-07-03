import { Server } from "http";
import app from "../src/main";
import { signInTestUser } from "../src/auth/signInUser";
import { Auth, signOut } from "firebase/auth";

/**
 * ### TestSingleton allows us to simplify our test setup/teardown code
 * 
 * Instead of having to write a repetitive beforeAll() and afterAll() for setting up our
 * server and testUser in every test file, we rely on setupTests.ts to do this once per file.
 * - Since we don't want to set globals in setupTests, we use a singleton class to hold our stuff
 * that is instantiated (i.e. server, idToken, clientFbAuth for logging out, etc.)
 *
 * _This strategy __requires__ using `--runInBand` flag with jest so that tests (and files)
 * run sequentially_, such that only one TestSingleton is active at a time.
 *
 * This singleton should be first instantiated in our setupTests.ts file that runs
 * as a part of Jest's setup.
 * ```javascript
 * /// jest.config
 * setupFilesAfterEnv: ["<rootDir>/tests/setupTests.ts"]
 * 
 * /// setupTests.ts
 * beforeAll(async () => {
  await TestSingleton.getInstance().ready;
});

afterAll(async () => {
  await TestSingleton.getInstance().teardown();
});
 * ```
---
 * #### Class properties
 * - `server` - an instance of our Express app. In this manner, all tests within a
 * file will reuse this instance.
 * - `idToken` - the result of this singleton logging in our testUser. This is what we use
 * to authenticate our HTTP requests (in real app and with integration testing)
 */
export class TestSingleton {
  /**
   * The singleton instance
   */
  private static instance: TestSingleton;

  /**
   * The Express app that is currently listening
   */
  public server: Server;

  /**
   * The Firebase client auth service (handles login/logout)
   */
  private clientFbAuth: Auth;

  /**
   * The testUser's idToken
   */
  public idToken: string;

  /**
   * A Promise which we can await to know when the singleton is initialized/ready
   */
  public ready: Promise<void>;

  private constructor() {
    this.ready = this.setup();
  }

  public static getInstance(): TestSingleton {
    if (!TestSingleton.instance) {
      const singleton = new TestSingleton();
      TestSingleton.instance = singleton;
    }
    return TestSingleton.instance;
  }

  private async setup() {
    // ... setup logic ...
    this.server = app.listen();

    const res = await signInTestUser();
    this.clientFbAuth = res.clientFbAuth;
    this.idToken = res.idToken;
  }

  public async teardown() {
    this.server.close();

    if (this.clientFbAuth) {
      await signOut(this.clientFbAuth);
    }
  }
}
