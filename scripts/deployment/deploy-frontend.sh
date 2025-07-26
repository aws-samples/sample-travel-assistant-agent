#!/bin/bash
set -e

cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    set -a
    source ../../.env
    set +a
fi

# Generate frontend environment config
cd ../
yarn install
yarn write-front-end-env

# Build and deploy frontend
cd ../web
yarn install
yarn build

# Upload to S3 and invalidate CloudFront
FRONT_END_BUCKET=$(aws cloudformation describe-stacks --stack-name=$STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`ClientAppBucket`].OutputValue | [0]' --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name=$STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`DistributionID`].OutputValue | [0]' --output text)

aws s3 sync dist/ s3://${FRONT_END_BUCKET}/
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" --no-cli-pager
