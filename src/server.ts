import express from 'express';
import { Application, Request, Response } from 'express';
import thumbnailRoutes from './routes/thumbnail';

const app: Application = express();
app.use(express.json({ limit: '20mb' }));

const port = 3000;

const client = require('prom-client');

client.collectDefaultMetrics();
const register = client.register;

const httpRequestDurationMilliseconds = new client.Histogram({
  name: 'node_request_duration_milliseconds',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const responseTimeInMilliseconds = Date.now() - start;
    httpRequestDurationMilliseconds
      .labels(req.method, req.route?.path)
      .observe(responseTimeInMilliseconds);
  });
  next()
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/', (_: Request, res: Response) => {
  res.status(200).send({ data: 'Hello from Thumbnail Generator' });
});

// Health check endpoint
app.get('/health', async (req, res: Response) => {
  res.status(200).send({ data: 'OK' });
});

// Thumbnail controller
app.use('/thumbnail', thumbnailRoutes);


app.listen(port, () => console.log(`Server is listening on port ${port}`));
