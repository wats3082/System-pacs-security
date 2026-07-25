import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { deviceRouter } from './routes/devices';
import { ruleRouter } from './routes/rules';
import { incidentRouter } from './routes/incidents';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api/devices', deviceRouter);
app.use('/api/rules', ruleRouter);
app.use('/api/incidents', incidentRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`PACS Security backend listening on http://localhost:${port}`);
});
