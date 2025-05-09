import express from 'express';
import { Application, Request, Response } from 'express';
import thumbnailRoutes from './routes/thumbnail';

const app: Application = express();
app.use(express.json({ limit: '20mb' }));

const port = 3000;

const client = require('prom-client');

client.collectDefaultMetrics();
const register = client.register;

// These metrics would move to its own metric helper and be imported
// and then reused in other files
const httpRequestDurationMilliseconds = new client.Histogram({
  name: 'http_request_duration_milliseconds',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000],
});

const totalHttpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route'],
});

const non200Responses = new client.Counter({
  name: 'http_requests_non_200_total',
  help: 'Total number of HTTP responses with status codes other than 200',
  labelNames: ['method', 'route', 'code'],
});

const failedResponses = new client.Counter({
  name: 'http_failed_responses_total',
  help: 'Total number of HTTP responses where app returned status: failed',
  labelNames: ['method', 'route'],
});

// As above, would move this to its own metric helper and be imported and re-used
function withMetrics(routePath: string, handler: (req: Request, res: Response) => void) {
  return (req: Request, res: Response) => {
    const end = httpRequestDurationMilliseconds.startTimer();
    res.on('finish', () => {
      end({ method: req.method, route: routePath, code: res.statusCode.toString() });
    });
    handler(req, res);
  };
}

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/', withMetrics('/', (_: Request, res: Response) => {
  res.status(200).send({ data: 'Hello from Thumbnail Generator v1.0.2' });
}));

// Health check endpoint
app.get('/health', withMetrics('/health', async (_req, res) => {
  res.status(200).send({ data: 'OK' });
}));

// Thumbnail controller
app.use('/thumbnail', (req, res, next) => {
  const end = httpRequestDurationMilliseconds.startTimer();
  const originalSend = res.send.bind(res);

  res.send = function (body) {
    try {
      const routePath = `/thumbnail${req.route?.path || ''}`;

      // Increment counter even before sending
      totalHttpRequests.inc({ method: req.method, route: routePath });

      if (res.statusCode !== 200) {
        non200Responses.inc({ method: req.method, route: routePath, code: res.statusCode.toString() });
      }

      // Inspect body if JSON
      let json;
      if (typeof body === 'string') {
        json = JSON.parse(body);
      } else if (typeof body === 'object') {
        json = body;
      }
      // Check if the response contains a failed status
      // This is a little hacky, and results in emitting doulbe metrics due to the call inside the route/thumbnails
      // Would move the metric emission elsewhere
      if (json?.data?.status?.toLowerCase() === 'failed') {
        failedResponses.inc({ method: req.method, route: routePath });
      }
    } catch (err) {
      console.warn('Error parsing response for metrics:', err.message);
    }

    return originalSend(body);
  };

  res.on('finish', () => {
    const routePath = `/thumbnail${req.route?.path || ''}`;
    end({ method: req.method, route: routePath, code: res.statusCode.toString() });
  });
  next();
}, thumbnailRoutes);

app.listen(port, () => console.log(`Server is listening on port ${port}`));
