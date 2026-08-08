import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const userPoolId = args.get('--user-pool-id');
const email = args.get('--email');
const region = args.get('--region') ?? process.env.AWS_REGION ?? 'us-east-1';

if (!userPoolId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run user:create -- --user-pool-id <id> --email <address> [--region <region>]');
  process.exit(2);
}

const client = new CognitoIdentityProviderClient({ region });
try {
  await client.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    DesiredDeliveryMediums: ['EMAIL'],
  }));
  console.log(`Created ${email}; Cognito sent a temporary password by email.`);
} catch (error) {
  if (error instanceof UsernameExistsException) {
    console.log(`${email} already exists; no changes made.`);
  } else {
    throw error;
  }
}
