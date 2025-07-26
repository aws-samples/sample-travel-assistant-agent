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

import { Duration, Stack } from 'aws-cdk-lib';
import type { AuthorizationType, IAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { LambdaRestApi, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { ManagedPolicy, Role, ServicePrincipal, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';


interface AddMethodInput {
  restAPI: LambdaRestApi;
  authorizationType: AuthorizationType;
  authorizer: IAuthorizer;
  resources: { apiName: string; methods: string[] }[];
}

const addMethods = ({ authorizationType, authorizer, resources, restAPI }: AddMethodInput): void => {
  resources.forEach(({ apiName, methods }) => {
    const apiResource = restAPI.root.addResource(apiName);

    methods.forEach((method) => {
      apiResource.addMethod(method, undefined, {
        authorizationType,
        authorizer,
      });
    });
  });
};

interface RestAPIProps {
  lambdaEntry: string;
  authorizer: IAuthorizer;
  authorizationType: AuthorizationType;
  knowledgeBaseId: string;
}

export class RestAPI extends Construct {
  restAPILambdaRole: Role;
  lambdaRestAPI: LambdaRestApi;

  constructor(scope: Construct, id: string, {
     lambdaEntry, authorizationType, authorizer, knowledgeBaseId}: RestAPIProps) {
    super(scope, id);

    // Get the Stack instance
    const stack = Stack.of(this);

    // Get secret names from environment or use defaults
    const openweatherSecretName = process.env.OPENWEATHER_SECRET_NAME || `openweather_maps_keys`;
    const paapiSecretName = process.env.PAAPI_SECRET_NAME || `paapi_keys`;
    const googleSearchSecretName = process.env.GOOGLE_SEARCH_SECRET_NAME || `google_search_keys`;

    this.restAPILambdaRole = new Role(this, 'APIRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    this.restAPILambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Bedrock permissions for specific models and knowledge base
    this.restAPILambdaRole.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        // Foundation model ARNs - all regions
        `arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0`,
        `arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0`,
        // Inference profile ARNs - all regions
        `arn:aws:bedrock:*:${stack.account}:inference-profile/amazon.nova-lite-v1:0`,
        `arn:aws:bedrock:*:${stack.account}:inference-profile/amazon.nova-pro-v1:0`
      ],
    }));

    // Bedrock Agent Runtime permissions for specific knowledge base only
    this.restAPILambdaRole.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate'
      ],
      resources: [
        `arn:aws:bedrock:${stack.region}:${stack.account}:knowledge-base/${knowledgeBaseId}`
      ],
    }));

    this.restAPILambdaRole.addToPolicy(new PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${openweatherSecretName}*`,
        `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${paapiSecretName}*`,
        `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${googleSearchSecretName}*`
      ],
    }));


    // Create a DynamoDB tables
    const user_table = new dynamodb.Table(this, 'paapi-user-table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const chat_table = new dynamodb.Table(this, 'paapi-chat-table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    const wishlist_table = new dynamodb.Table(this, 'paapi-wishlist-table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    const restAPILambda = new lambda.DockerImageFunction(this, 'api', {
      code: lambda.DockerImageCode.fromImageAsset(lambdaEntry, {
        platform: Platform.LINUX_AMD64,
      }),
      role: this.restAPILambdaRole,
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseId,
        USER_TABLE_NAME: user_table.tableName, 
        CHAT_TABLE_NAME: chat_table.tableName,
        WISHLIST_TABLE_NAME: wishlist_table.tableName,
        OPENWEATHER_SECRET_NAME: openweatherSecretName,
        PAAPI_SECRET_NAME: paapiSecretName,
        GOOGLE_SEARCH_SECRET_NAME: googleSearchSecretName,
        USE_PAAPI: process.env.USE_PAAPI || 'false',
      },
    });

    // Suppress CKV_AWS_173 - Lambda environment variables are encrypted using AWS managed key
    NagSuppressions.addResourceSuppressions(restAPILambda, [
      {
        id: 'CKV_AWS_173',
        reason: 'Lambda environment variables use AWS managed encryption key for demo application. Environment variables contain non-sensitive configuration data like table names and secret names (not actual secrets).',
      },
    ]);

    // Grant specific DynamoDB permissions to created tables only
    user_table.grantReadWriteData(this.restAPILambdaRole);
    chat_table.grantReadWriteData(this.restAPILambdaRole);
    wishlist_table.grantReadWriteData(this.restAPILambdaRole);

    this.lambdaRestAPI = new LambdaRestApi(this, 'RestApi', {
      handler: restAPILambda,
      proxy: false,
      description: 'API for Bedrock demo',
      deployOptions: {
        stageName: 'api',
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
      },
    });

    addMethods({
      restAPI: this.lambdaRestAPI,
      authorizationType,
      authorizer,
      resources: [
        {
          apiName: 'prompt',
          methods: ['POST'],
        },
      ],
    });

    this.lambdaRestAPI.addUsagePlan('ApiUsagePlan', {
      throttle: {
        burstLimit: 10,
        rateLimit: 20,
      },
    });
  }
}
