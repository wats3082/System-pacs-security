import { Router } from 'express';

export const incidentRouter = Router();

const incidents = [
  {
    id: 'incident-1',
    title: 'Front gate motion event',
    source: 'sensor-1',
    timestamp: new Date().toISOString(),
    status: 'open'
  }
];

incidentRouter.get('/', (_req, res) => {
  res.json(incidents);
});
