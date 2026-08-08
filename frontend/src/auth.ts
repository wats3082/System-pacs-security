import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
  type IAuthenticationDetailsData,
} from 'amazon-cognito-identity-js';
import type { RuntimeConfig } from './config';

export interface UserSession {
  email: string;
  expiresAt: number;
}

export interface PasswordChallenge {
  user: CognitoUser;
  attributes: Record<string, string>;
  requiredAttributes: string[];
}

export type SignInResult =
  | { kind: 'signedIn'; session: UserSession }
  | { kind: 'newPassword'; challenge: PasswordChallenge };

function sessionInfo(session: CognitoUserSession): UserSession {
  const claims = session.getIdToken().decodePayload() as Record<string, unknown>;
  return {
    email: typeof claims.email === 'string' ? claims.email : 'Authenticated user',
    expiresAt: session.getIdToken().getExpiration() * 1000,
  };
}

export class AuthClient {
  private readonly pool: CognitoUserPool;

  constructor(config: RuntimeConfig) {
    this.pool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.userPoolClientId,
    });
  }

  async restore(): Promise<UserSession | null> {
    const user = this.pool.getCurrentUser();
    if (!user) return null;
    return sessionInfo(await this.session(user));
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const user = new CognitoUser({ Username: email, Pool: this.pool });
    const details: IAuthenticationDetailsData = { Username: email, Password: password };
    return new Promise((resolve, reject) => {
      user.authenticateUser(new AuthenticationDetails(details), {
        onSuccess: (session) => resolve({ kind: 'signedIn', session: sessionInfo(session) }),
        onFailure: reject,
        newPasswordRequired: (attributes, requiredAttributes) => {
          delete attributes.email_verified;
          resolve({
            kind: 'newPassword',
            challenge: {
              user,
              attributes,
              requiredAttributes,
            },
          });
        },
      });
    });
  }

  async completeNewPassword(
    challenge: PasswordChallenge,
    password: string,
  ): Promise<UserSession> {
    return new Promise((resolve, reject) => {
      challenge.user.completeNewPasswordChallenge(
        password,
        challenge.attributes,
        {
          onSuccess: (session) => resolve(sessionInfo(session)),
          onFailure: reject,
        },
      );
    });
  }

  async token(): Promise<string> {
    const user = this.pool.getCurrentUser();
    if (!user) throw new Error('Your session has ended. Sign in again.');
    return (await this.session(user)).getIdToken().getJwtToken();
  }

  signOut(): void {
    this.pool.getCurrentUser()?.signOut();
  }

  private session(user: CognitoUser): Promise<CognitoUserSession> {
    return new Promise((resolve, reject) => {
      user.getSession((error: Error | null, session: CognitoUserSession | null) => {
        if (error) reject(error);
        else if (session?.isValid()) resolve(session);
        else reject(new Error('Your session is invalid. Sign in again.'));
      });
    });
  }
}
