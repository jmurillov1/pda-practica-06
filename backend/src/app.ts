import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { createApiRouter } from './routes/index.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import type { Dependencies } from './container.js';

export const createApp = ({ employeeController }: Dependencies): Express => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.use('/api/v1', createApiRouter(employeeController));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
