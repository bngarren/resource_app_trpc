declare module "pino-socket" {
  interface PinoSocketOptions {
    address: string;
    port: number;
    mode?: "tcp" | "udp";
  }

  function pinoSocket(options: PinoSocketOptions): NodeJS.WritableStream;
  export = pinoSocket;
}
