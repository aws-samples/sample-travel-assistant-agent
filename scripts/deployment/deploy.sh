#!/bin/bash
set -e  # Exit immediately if any command fails
set -u  # Exit if undefined variables are used

cd "$(dirname "$0")"

echo "🚀 Starting deployment..."

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    echo "📋 Loading environment variables from .env file..."
    set -a  # automatically export all variables
    source ../../.env
    set +a  # stop auto-exporting
else
    echo "❌ Error: .env file not found in project root"
    echo "Please copy .env.example to .env and configure it"
    exit 1
fi

# Validate required environment variables
if [ -z "${STACK_NAME:-}" ]; then
    echo "❌ Error: STACK_NAME not set in .env file"
    exit 1
fi

echo "✅ Using stack name: $STACK_NAME"

# Check prerequisites
echo "🔍 Checking prerequisites..."
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found. Please install AWS CLI"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Please install Node.js"; exit 1; }
command -v yarn >/dev/null 2>&1 || { echo "❌ Yarn not found. Please install yarn with: npm install -g yarn"; exit 1; }

# Check AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "❌ AWS credentials not configured. Run 'aws configure'"; exit 1; }

echo "✅ All prerequisites met"

# Deploy backend infrastructure
echo "📦 Deploying backend infrastructure..."
if ./deploy-backend.sh; then
    echo "✅ Backend deployment completed"
else
    echo "❌ Backend deployment failed"
    exit 1
fi

# Upload knowledge base documents  
echo "📚 Uploading knowledge base documents..."
if ./upload-docs.sh; then
    echo "✅ Document upload completed"
else
    echo "❌ Document upload failed"
    exit 1
fi

# Deploy frontend
echo "🌐 Deploying frontend..."
if ./deploy-frontend.sh; then
    echo "✅ Frontend deployment completed"
else
    echo "❌ Frontend deployment failed"
    exit 1
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "Your travel assistant is now available at:"
DISTRIBUTION_DOMAIN=$(aws cloudformation describe-stacks --stack-name="$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`WebApDomain`].OutputValue | [0]' --output text 2>/dev/null || echo "Unable to retrieve domain")
echo "🌐 $DISTRIBUTION_DOMAIN"
