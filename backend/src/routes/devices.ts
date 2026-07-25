import { Router } from 'express';

export const deviceRouter = Router();

const devices = [
  { id: 'cam-1', type: 'camera', name: 'Front Gate Camera' },
  { id: 'sensor-1', type: 'motion', name: 'Lobby Motion Sensor' }
];

deviceRouter.get('/', (_req, res) => {
  res.json(devices);
});

deviceRouter.get('/:id', (req, res) => {
  const device = devices.find((item) => item.id === req.params.id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  res.json(device);
});
