/*
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. 
*/

import { CfnIdentityPool, CfnIdentityPoolRoleAttachment, Mfa, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Effect, FederatedPrincipal, Policy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface UserPoolWithIdentityProps {
  region: string;
  account: string;
}

export class UserPoolWithIdentity extends Construct {
  userPool: UserPool;
  identityPool: CfnIdentityPool;
  userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, { account, region }: UserPoolWithIdentityProps) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      mfa: Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true
      },
      selfSignUpEnabled: false,
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      signInAliases: {
        email: true,
      },
    });

    this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
    });

    this.identityPool = new CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    const cognitoAuthenticatedRole = new Role(this, 'IdentityPoolRole', {
      assumedBy: new FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // Use minimal custom policy for Cognito Identity access
    cognitoAuthenticatedRole.addToPolicy(
      new PolicyStatement({
        actions: ['cognito-identity:GetId'],
        resources: [`arn:aws:cognito-identity:${region}:${account}:identitypool/${this.identityPool.ref}`],
        effect: Effect.ALLOW,
      })
    );

    new CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: { authenticated: cognitoAuthenticatedRole.roleArn },
    });
  }
}
