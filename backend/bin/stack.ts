#!/usr/bin/env node
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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';

import { BedrockDemoStack } from '../lib/BedrockDemoStack';

import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { Aspects } from "aws-cdk-lib";

dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.STACK_NAME) throw new Error('Missing STACK_NAME in .env');

const lambdaEntry = path.join(__dirname, '../../agents/travel-agent-langgraph');
const app = new cdk.App();



const bedrockStack = new BedrockDemoStack(app, process.env.STACK_NAME, {
  lambdaEntry,
});

// Add CloudFormation template version and CDK NAG checks
bedrockStack.templateOptions.templateFormatVersion = "2010-09-09";
Aspects.of(bedrockStack).add(new AwsSolutionsChecks({ verbose: true }));

// Add necessary suppressions for known acceptable cases
NagSuppressions.addStackSuppressions(bedrockStack, [
  {
    id: 'AwsSolutions-S1',
    reason: 'Client app bucket is configured with CloudFront distribution for secure access'
  },
  {
    id: 'AwsSolutions-S10',
    reason: 'Client bucket does not require SSL request enforcement as it is accessed through CloudFront'
  }
]);

app.synth();
