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

import * as fs from 'fs';
import * as path from 'path';

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const STACK_NAME = process.env.STACK_NAME;

if (!STACK_NAME) throw new Error('Missing STACK_NAME in .env');

const OUTPUT_KEYS_TO_ENV_MAP: Record<string, string> = {
  ClientPoolId: 'VITE_USER_POOL_CLIENT_ID',
  UserPoolId: 'VITE_USER_POOL_ID',
  RestAPIEndpoint: 'API_ENDPOINT',
  IdentityPoolId: 'VITE_IDENTITY_POOL_ID',
  ClientAppBucket: 'FRONT_END_BUCKET',
  DistributionID: 'DISTRIBUTION_ID'
};

const main = async (): Promise<void> => {
  const cfnClient = new CloudFormationClient({});

  const describeStacksResponse = await cfnClient.send(new DescribeStacksCommand({ StackName: STACK_NAME }));

  const outputs = describeStacksResponse.Stacks?.[0]?.Outputs;

  if (!outputs) throw new Error(`Could not find a stack of name ${STACK_NAME} with outputs`);

  const envVariablesFromOutputMap = Object.fromEntries(
    outputs
      .map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue] as const)
      .filter((tuple): tuple is [string, string] => !!tuple[0] && tuple[0] in OUTPUT_KEYS_TO_ENV_MAP && !!tuple[1])
      .map(([outputKey, value]): [string, string] => [OUTPUT_KEYS_TO_ENV_MAP[outputKey], value]),
  );

  const region = envVariablesFromOutputMap.VITE_USER_POOL_ID.split('_')[0];

  const env = {
    ...envVariablesFromOutputMap,
    VITE_REGION: region,
  };

  const envContents = Object.entries(env)
    .map((kvp) => kvp.join('='))
    .join('\n');

  fs.writeFileSync(path.join(__dirname, '../../web/.env'), envContents);
};

void main();
