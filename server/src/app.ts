import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import swaggerSpec from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import { auditMiddleware } from './middleware/auditMiddleware';
import { NotFoundError } from './shared/errors/appError';

const app = express();

// ── Global Middlewares ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API Documentation ───────────────────────────────────────────────────────
// Swagger UI — interactive docs at /api/docs
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Dana Motors API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
    },
  }),
);

// Raw OpenAPI JSON spec — useful for Postman imports and client generation
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Central Routing Hook ────────────────────────────────────────────────────
// Audit middleware is applied before routes so it can register a res.on('finish')
// listener on each request. The listener fires after the response is fully sent,
// regardless of middleware ordering — but the listener must be attached before
// the route handler runs and calls res.json() / res.send().
app.use('/api', auditMiddleware, routes);

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

