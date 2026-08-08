#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { SecurityOperationsPlatformStack } from '../lib/security-operations-platform-stack';

const app = new App();

new SecurityOperationsPlatformStack(app, 'SecurityOperationsPlatformStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
      ?? process.env.AWS_REGION
      ?? app.node.tryGetContext('region')
      ?? 'us-east-1',
  },
});
