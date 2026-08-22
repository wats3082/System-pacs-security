import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SecurityOperationsPlatformStack } from '../lib/security-operations-platform-stack';

describe('SecurityOperationsPlatformStack', () => {
  const app = new App();
  const stack = new SecurityOperationsPlatformStack(app, 'TestStack', {
    frontendAssetPath: path.join(__dirname, 'fixtures/site'),
  });
  const template = Template.fromStack(stack);

  it('defines protected data stores and current Lambda runtimes', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
    }, 6);
  });

  it('wires Cognito authorization to protected API methods', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      AuthorizationType: 'COGNITO_USER_POOLS',
      AuthorizerId: Match.anyValue(),
    });
  });

  it('grants event investigation updates without broad table access', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike({
          Action: Match.arrayWith(['dynamodb:UpdateItem']),
          Effect: 'Allow',
        })]),
      },
    });
  });
});
