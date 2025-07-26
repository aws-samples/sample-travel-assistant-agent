#!/bin/bash
set -e

cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    set -a
    source ../../.env
    set +a
fi

# Check if KB_DOCS_PATH is configured and directory exists
if [ -z "${KB_DOCS_PATH:-}" ] || [ ! -d "$KB_DOCS_PATH" ]; then
    echo "No KB_DOCS_PATH specified or directory not found, skipping knowledge base upload"
    exit 0
fi

# Get parameters from CDK stack outputs
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name="$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DocBucketName'].OutputValue" --output text)
KNOWLEDGE_BASE_ID=$(aws cloudformation describe-stacks --stack-name="$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseId'].OutputValue" --output text)
DATA_SOURCE_ID=$(aws cloudformation describe-stacks --stack-name="$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DataSourceId'].OutputValue" --output text)

# Upload documents to S3
aws s3 sync "$KB_DOCS_PATH/" "s3://${BUCKET_NAME}/docs/" --exclude "*.DS_Store"

# Start ingestion job
aws bedrock-agent start-ingestion-job --knowledge-base-id "$KNOWLEDGE_BASE_ID" --data-source-id "$DATA_SOURCE_ID" --no-cli-pager
