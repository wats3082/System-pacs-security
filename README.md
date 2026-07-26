# pacs-security

React/Vite frontend with the same portfolio-style layout and an AWS serverless backend foundation.

## MVP scope

- Users and roles management
- Access event ingest and audit retrieval
- Device registration and status tracking

## Repository layout

```text
frontend/      React + Vite client
backend/       API implementation
infra/cdk/     AWS CDK (API Gateway + Lambda + DynamoDB + Cognito)
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## CDK infrastructure

```bash
cd infra/cdk
npm install
npm run bootstrap
npm run deploy
```

## Planned API routes

- `GET /api/users`
- `POST /api/users`
- `GET /api/roles`
- `POST /api/roles`
- `GET /api/events`
- `POST /api/events`
- `GET /api/devices`
- `POST /api/devices`
