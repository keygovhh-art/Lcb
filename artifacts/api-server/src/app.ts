import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { PostgresSessionStore } from "./lib/postgres-session-store";
import { sessionOptions, usesPostgresSessions } from "./lib/session-options";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    ...sessionOptions(process.env),
    ...(usesPostgresSessions(process.env) ? { store: new PostgresSessionStore(pool) } : {}),
  })
);

app.use("/api", router);
// Unknown API paths must not fall through to the SPA.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use(((err, req, res, next) => {
  req.log.error({ err }, "Request failed");
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
}) as express.ErrorRequestHandler);

export default app;
