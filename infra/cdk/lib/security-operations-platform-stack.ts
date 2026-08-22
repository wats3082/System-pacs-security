import * as path from 'node:path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface SecurityOperationsPlatformStackProps extends StackProps {
  frontendAssetPath?: string;
}

export class SecurityOperationsPlatformStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: SecurityOperationsPlatformStackProps = {},
  ) {
    super(scope, id, props);

    const tenantId = this.node.tryGetContext('tenantId') ?? 'default';
    const allowedOrigin = this.node.tryGetContext('allowedOrigin') as string | undefined;
    const frontendAssetPath = props.frontendAssetPath
      ?? path.join(__dirname, '../../../frontend/dist');

    const eventsTable = this.eventsTable();
    const devicesTable = this.devicesTable();
    const videosTable = this.videosTable();

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OFF,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(3),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
    });

    const commonEnvironment = {
      TENANT_ID: tenantId,
      ALLOWED_ORIGINS: allowedOrigin ?? '',
      NODE_OPTIONS: '--enable-source-maps',
    };
    const eventsFn = this.function('EventsFunction', 'events.ts', {
      ...commonEnvironment,
      EVENTS_TABLE_NAME: eventsTable.tableName,
    });
    const devicesFn = this.function('DevicesFunction', 'devices.ts', {
      ...commonEnvironment,
      DEVICES_TABLE_NAME: devicesTable.tableName,
    });
    const videosFn = this.function('VideosFunction', 'videos.ts', {
      ...commonEnvironment,
      VIDEOS_TABLE_NAME: videosTable.tableName,
    });
    const kpisFn = this.function('KpisFunction', 'kpis.ts', {
      ...commonEnvironment,
      EVENTS_TABLE_NAME: eventsTable.tableName,
      DEVICES_TABLE_NAME: devicesTable.tableName,
      VIDEOS_TABLE_NAME: videosTable.tableName,
    });
    const healthFn = this.function('HealthFunction', 'health.ts', commonEnvironment);
    const configFn = this.function('ConfigFunction', 'config.ts', {
      ...commonEnvironment,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    });

    this.grant(eventsFn, eventsTable, [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ]);
    this.grant(devicesFn, devicesTable, [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ]);
    this.grant(videosFn, videosTable, [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ]);
    for (const table of [eventsTable, devicesTable, videosTable]) {
      kpisFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [`${table.tableArn}/index/*`],
      }));
    }

    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const api = new apigw.RestApi(this, 'Api', {
      restApiName: 'security-operations-platform',
      deployOptions: {
        stageName: 'prod',
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        dataTraceEnabled: false,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        tracingEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
      endpointTypes: [apigw.EndpointType.REGIONAL],
      ...(allowedOrigin ? {
        defaultCorsPreflightOptions: {
          allowOrigins: [allowedOrigin],
          allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
          allowHeaders: ['Authorization', 'Content-Type', 'X-Correlation-ID'],
          maxAge: Duration.hours(1),
        },
      } : {}),
    });
    if (allowedOrigin) {
      const responseHeaders = {
        'Access-Control-Allow-Origin': `'${allowedOrigin}'`,
        'Access-Control-Allow-Headers': "'Authorization,Content-Type,X-Correlation-ID'",
        Vary: "'Origin'",
      };
      api.addGatewayResponse('Default4xx', {
        type: apigw.ResponseType.DEFAULT_4XX,
        responseHeaders,
      });
      api.addGatewayResponse('Default5xx', {
        type: apigw.ResponseType.DEFAULT_5XX,
        responseHeaders,
      });
    }
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });
    const secured: apigw.MethodOptions = {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    };

    const apiRoot = api.root.addResource('api');
    apiRoot.addResource('health')
      .addMethod('GET', new apigw.LambdaIntegration(healthFn));
    apiRoot.addResource('config')
      .addMethod('GET', new apigw.LambdaIntegration(configFn));

    const events = apiRoot.addResource('events');
    events.addMethod('GET', new apigw.LambdaIntegration(eventsFn), secured);
    events.addMethod('POST', new apigw.LambdaIntegration(eventsFn), secured);
    events.addResource('evaluate')
      .addMethod('POST', new apigw.LambdaIntegration(eventsFn), secured);
    events.addResource('{eventId}').addResource('investigation')
      .addMethod('PATCH', new apigw.LambdaIntegration(eventsFn), secured);

    const devices = apiRoot.addResource('devices');
    devices.addMethod('GET', new apigw.LambdaIntegration(devicesFn), secured);
    devices.addMethod('POST', new apigw.LambdaIntegration(devicesFn), secured);
    const device = devices.addResource('{deviceId}');
    device.addMethod('PATCH', new apigw.LambdaIntegration(devicesFn), secured);
    device.addResource('heartbeat')
      .addMethod('POST', new apigw.LambdaIntegration(devicesFn), secured);

    const videos = apiRoot.addResource('videos');
    videos.addMethod('GET', new apigw.LambdaIntegration(videosFn), secured);
    videos.addMethod('POST', new apigw.LambdaIntegration(videosFn), secured);
    videos.addResource('{videoId}')
      .addMethod('PATCH', new apigw.LambdaIntegration(videosFn), secured);

    apiRoot.addResource('kpis').addResource('summary')
      .addMethod('GET', new apigw.LambdaIntegration(kpisFn), secured);

    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
`),
    });
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [{
          function: spaRewrite,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      additionalBehaviors: {
        'api/*': {
          origin: new origins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            {
              originPath: '/prod',
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            },
          ),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(frontendAssetPath)],
      prune: true,
    });

    new CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'ApiUrl', { value: api.url });
    new CfnOutput(this, 'HealthUrl', {
      value: `https://${distribution.distributionDomainName}/api/health`,
    });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }

  private eventsTable(): dynamodb.Table {
    const table = this.table('EventsTable', 'eventId');
    const indexes: Array<[string, string]> = [
      ['TenantTimeIndex', 'tenantId'],
      ['FacilityTimeIndex', 'tenantFacility'],
      ['DeviceTimeIndex', 'tenantDevice'],
    ];
    for (const [indexName, partitionKey] of indexes) {
      table.addGlobalSecondaryIndex({
        indexName,
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'timeKey', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }
    return table;
  }

  private devicesTable(): dynamodb.Table {
    const table = this.table('DevicesTable', 'deviceId');
    table.addGlobalSecondaryIndex({
      indexName: 'TenantUpdatedIndex',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAtDeviceId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    return table;
  }

  private videosTable(): dynamodb.Table {
    const table = this.table('VideosTable', 'videoId');
    table.addGlobalSecondaryIndex({
      indexName: 'TenantCreatedIndex',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAtVideoId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'TenantStatusIndex',
      partitionKey: { name: 'tenantStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAtVideoId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    return table;
  }

  private table(id: string, key: string): dynamodb.Table {
    return new dynamodb.Table(this, id, {
      partitionKey: { name: key, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }

  private function(
    id: string,
    entry: string,
    environment: Record<string, string>,
  ): nodejs.NodejsFunction {
    const logGroup = new logs.LogGroup(this, `${id}Logs`, {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    return new nodejs.NodejsFunction(this, id, {
      entry: path.join(__dirname, `../../../backend/src/handlers/${entry}`),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment,
      bundling: {
        bundleAwsSDK: true,
        minify: true,
        sourceMap: true,
        target: 'node24',
        format: nodejs.OutputFormat.CJS,
      },
    });
  }

  private grant(
    fn: nodejs.NodejsFunction,
    table: dynamodb.Table,
    actions: string[],
  ): void {
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions,
      resources: [table.tableArn, `${table.tableArn}/index/*`],
    }));
  }
}
