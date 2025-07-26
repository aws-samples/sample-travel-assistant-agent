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

import type { StackProps } from 'aws-cdk-lib';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AuthorizationType, CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { CloudFrontAllowedMethods } from 'aws-cdk-lib/aws-cloudfront';
import { ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import type { Construct } from 'constructs';

import { ClientAppBucket } from './ClientAppBucket';
import { CloudFrontDistribution } from './CloudFrontDistribution';
import { RestAPI } from './RestAPI';
import { UserPoolWithIdentity } from './UserPoolWithIdentity';

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

interface BedrockDemoStackProps extends StackProps {
  lambdaEntry: string;
}

export class BedrockDemoStack extends Stack {
  constructor(scope: Construct, id: string, props: BedrockDemoStackProps) {
    super(scope, id, props);

    // Create Knowledge Base
    const kb = new bedrock.KnowledgeBase(this, 'KnowledgeBase', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      instruction: 'Use this knowledge base to get insights for travel recommendations.',
    });

    const docBucket = new s3.Bucket(this, 'DocBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const dataSource = new bedrock.S3DataSource(this, 'DataSource', {
      bucket: docBucket,
      knowledgeBase: kb,
      dataSourceName: 'documents',
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });


    // Authentication set up
    const { userPool, identityPool, userPoolClient } = new UserPoolWithIdentity(this, 'UserPool', {
      account: this.account,
      region: this.region,
    });

    // Client Bucket & CloudFront Policy
    const { bucket: clientAppBucket } = new ClientAppBucket(this, 'ClientBucket');
    const cloudfrontPolicyStatement = new PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${clientAppBucket.bucketArn}/*`],
      principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
        },
      },
    });
    clientAppBucket.addToResourcePolicy(cloudfrontPolicyStatement);

    // API Setup
    const { lambdaRestAPI } = new RestAPI(this, 'RestAPI', {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
        cognitoUserPools: [userPool],
      }),
      lambdaEntry: props.lambdaEntry,
      knowledgeBaseId: kb.knowledgeBaseId
    });

    // CloudFront Distribution
    const { webDistribution } = new CloudFrontDistribution(this, 'CloudFrontDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: clientAppBucket,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
        {
          customOriginSource: {
            domainName: `${lambdaRestAPI.restApiId}.execute-api.${this.region}.amazonaws.com`,
          },
          behaviors: [
            {
              pathPattern: `${lambdaRestAPI.deploymentStage.stageName}/*`,
              allowedMethods: CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                queryString: true,
                headers: ['Authorization'],
              },
              defaultTtl: Duration.seconds(0),
              minTtl: Duration.seconds(0),
            },
          ],
        },
      ],
      errorConfigurations: [
        {
          errorCode: 404,
          responseCode: 200,
          errorCachingMinTtl: 5,
          responsePagePath: '/index.html',
        },
      ],
      domainName: process.env.DOMAIN_NAME,
    });

    // Outputs
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'WebApDomain', {
      value: `https://${webDistribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'DistributionID', {
      value: webDistribution.distributionId,
    });
    new CfnOutput(this, 'ClientAppBucket', { value: clientAppBucket.bucketName });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'ClientPoolId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'RestAPIEndpoint', {
      value: `https://${webDistribution.distributionDomainName}/${lambdaRestAPI.deploymentStage.stageName}`,
    });
    new CfnOutput(this, 'KnowledgeBaseId', { value: kb.knowledgeBaseId });
    new CfnOutput(this, 'DataSourceId', { value: dataSource.dataSourceId });
    new CfnOutput(this, 'DocBucketName', { value: docBucket.bucketName });

    // Add suppressions for necessary broad permissions
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-COG3',
          reason: 'Advanced security mode not enforced for demo purposes'
        },
        {
          id: 'AwsSolutions-APIG2',
          reason: 'Request validation not enabled for demo purposes'
        },
        {
          id: 'AwsSolutions-APIG1',
          reason: 'Access logging not enabled for demo purposes'
        },
        {
          id: 'AwsSolutions-CFR3',
          reason: 'CloudFront access logging not enabled for demo purposes'
        },
        {
            id: 'AwsSolutions-CFR4',
            reason: 'TLS 1.2 minimum security policy is now enforced via minimumProtocolVersion configuration'
        },
        {
          id: 'AwsSolutions-CFR7',
          reason: 'Using OAI instead of OAC for demo compatibility'
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Using AWS managed policy for Lambda basic execution role in demo',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Using AWS managed policy for API Gateway CloudWatch logging in demo',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs']
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'LogRetention Lambda requires wildcard permissions to manage CloudWatch log groups',
          appliesTo: ['Resource::*']
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Secrets Manager requires wildcard suffix for secret versioning',
          appliesTo: [
            'Resource::arn:aws:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:openweather_maps_keys*',
            'Resource::arn:aws:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:paapi_keys*',
            'Resource::arn:aws:secretsmanager:<AWS::Region>:<AWS::AccountId>:secret:google_search_keys*'
          ]
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Bedrock models may be available in different regions than deployment region',
          appliesTo: [
            'Resource::arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0',
            'Resource::arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0',
            'Resource::arn:aws:bedrock:*:<AWS::AccountId>:inference-profile/amazon.nova-lite-v1:0',
            'Resource::arn:aws:bedrock:*:<AWS::AccountId>:inference-profile/amazon.nova-pro-v1:0'
          ]
        },
        {
          id: 'CKV_AWS_111',
          reason: 'LogRetention Lambda requires wildcard permissions to manage CloudWatch log groups for API Gateway logging',
          appliesTo: ['AWS::IAM::Policy.LogRetention*']
        }
      ],
      true
    );
  }
}
