# Replit Setup Guide

## Overview

This project is configured to run on Replit with automatic build and typecheck workflows.

## Environment Variables

- `VITE_APP_URL`: Set to your Vercel deployment URL
- `NODE_ENV`: Development or production

## Build Commands

```bash
# Install dependencies
pnpm install

# Run typecheck
pnpm run typecheck

# Build project
pnpm run build
```

## Deployment

The project is configured to deploy to Vercel via the `vercel.json` configuration.
