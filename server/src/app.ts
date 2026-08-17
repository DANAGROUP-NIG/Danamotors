import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { NotFoundError } from './shared/errors/appError';

const app = express();

// Global Middlewares
app.use(cors({origin: true, credentials: true}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Central Routing Hook
app.use('/api', routes);

// Handle 404/Not Found Routes
app.use((req, _res, next) => {
  next(new NotFoundError(`Cannot find ${req.method} ${req.originalUrl} on this server`));
});

// Global Error Handler
app.use(errorHandler);

export default app;
