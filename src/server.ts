import express from 'express';
import { Application, Request, Response } from 'express';
import thumbnailRoutes from './routes/thumbnail';

const app: Application = express();
app.use(express.json({ limit: '20mb' }));

const port = 3000;

const client = require('prom-client');

client.collectDefaultMetrics();
const register = client.register;

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
