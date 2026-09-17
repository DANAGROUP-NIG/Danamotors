import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import routes from "./routes";
import swaggerSpec from "./config/swagger";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { auditMiddleware } from "./middleware/auditMiddleware";
import { NotFoundError } from "./shared/errors/appError";

const app = express();

app.set("trust proxy", "loopback");

// ── Global Middlewares ──────────────────────────────────────────────────────
// Allow the production domain, any extra origins from CLIENT_URL (comma-separated),
// and localhost in non-production environments.
const allowedOrigins = [
  "https://danamotors.danagroup.net",
  ...(config.CLIENT_URL
    ? config.CLIENT_URL.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : []),
];

if (config.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000", "https://danamotors.vercel.app");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API Documentation ───────────────────────────────────────────────────────
// Swagger UI — interactive docs at /api/docs
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Dana Motors API Docs",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      docExpansion: "none",
      tagsSorter: "alpha",
    },
  }),
);

// Raw OpenAPI JSON spec — useful for Postman imports and client generation
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ── Central Routing Hook ────────────────────────────────────────────────────
// Audit middleware is applied before routes so it can register a res.on('finish')
// listener on each request. The listener fires after the response is fully sent,
// regardless of middleware ordering — but the listener must be attached before
// the route handler runs and calls res.json() / res.send().
app.use("/api", auditMiddleware, routes);

// ── Handle 404/Not Found Routes ─────────────────────────────────────────────
app.use((req, _res, next) => {
  next(
    new NotFoundError(
      `Cannot find ${req.method} ${req.originalUrl} on this server`,
    ),
  );
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
