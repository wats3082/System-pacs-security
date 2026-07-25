# PACS Security

A PACS security application workspace with separate backend and frontend packages.

## Overview

This project contains a security-focused application with a Node/Express backend and a React/Vite frontend.

## Structure

```
.pacs-security/
  backend/      # Express backend API
  frontend/     # React frontend application
  package.json  # npm workspace config
  README.md     # project documentation
  .gitignore    # repo ignores
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start both packages in development:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — start backend and frontend together
- `npm run install-all` — install dependencies for both workspaces

## Notes

- Keep this repository focused on the PACS security app only.
- Use the `backend` and `frontend` folders as the repository root packages.
