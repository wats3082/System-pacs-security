import { Router } from 'express';

export const ruleRouter = Router();

let rules = [
  {
    id: 'rule-1',
    name: 'Motion triggers camera clip',
    trigger: 'motion',
    action: 'record_clip'
  }
];

ruleRouter.get('/', (_req, res) => {
  res.json(rules);
});

ruleRouter.post('/', (req, res) => {
  const rule = { id: `rule-${rules.length + 1}`, ...req.body };
  rules.push(rule);
  res.status(201).json(rule);
});
