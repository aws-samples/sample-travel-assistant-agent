# Travel Assistant Agent

A sophisticated travel assistant agent built with [LangGraph](https://langchain-ai.github.io/langgraph/) and powered by [Amazon Bedrock](https://aws.amazon.com/bedrock/). This agent provides intelligent travel planning, recommendations, and shopping assistance through natural language interactions.

## Overview

The Travel Assistant Agent is a multi-node conversational AI system that can help users with various travel-related tasks including trip planning, weather forecasting, packing list generation, product search, and cart management. The agent uses a routing system to intelligently direct user queries to specialized nodes based on intent.

## Architecture

The agent is built using LangGraph's StateGraph framework with the following components:

- **Router Node**: Analyzes user input and routes to appropriate specialized nodes
- **Processing Nodes**: 12+ specialized nodes for different capabilities
- **State Management**: Maintains conversation history, user profile, and cart state
- **LLM Integration**: Uses Amazon Nova Lite and Nova Pro models via Bedrock

## Capabilities

The Travel Assistant Agent delivers comprehensive travel planning and shopping assistance through 13 specialized nodes that handle distinct aspects of the user journey. The system provides **conversational help and introductions** through the IntroNode, **real-time information discovery** via Google Custom Search API integration for current events and local insights, and **Amazon service guidance** for Prime benefits and policies. Core travel features include **intelligent trip recommendations** powered by Amazon Bedrock Knowledge Base with RAG technology for accurate destination advice, **real-time weather forecasting** using OpenWeather API for location-specific conditions, and **conversation management** with chat summarization and optional email integration. The shopping ecosystem encompasses **personalized packing list generation** with PAAPI integration for product suggestions, **comprehensive product search** across Amazon's catalog with detailed pricing and reviews, **intelligent cart management** for order processing, **natural language item removal** from carts, **historical product addition** by parsing previous conversations, and **grocery list creation** for travel supplies. Additionally, the agent maintains **user profiles and trip summaries** to provide personalized, context-aware assistance throughout the entire travel planning experience.

## Configuration

### Environment Variables

The agent requires the following environment variables:

```bash
# DynamoDB Tables
USER_TABLE_NAME=your-user-table-name
WISHLIST_TABLE_NAME=your-wishlist-table-name
CHAT_TABLE_NAME=your-chat-table-name

# Knowledge Base
KNOWLEDGE_BASE_ID=your-kb-id

# AWS Configuration
AWS_REGION=us-east-1

# API Secrets (stored in AWS Secrets Manager)
OPENWEATHER_SECRET_NAME=openweather_maps_keys
GOOGLE_SEARCH_SECRET_NAME=google_search_keys
PAAPI_SECRET_NAME=paapi_keys

# Optional: Enable/disable PAAPI features
USE_PAAPI=true
```

### AWS Secrets Manager Configuration

Create the following secrets in AWS Secrets Manager:

#### 1. OpenWeather API Key
**Secret name:** `openweather_maps_keys`
```json
{
  "openweather_key": "YOUR_API_KEY"
}
```

#### 2. Google Search API Keys
**Secret name:** `google_search_keys`
```json
{
  "cse_id": "YOUR_SEARCH_ENGINE_ID",
  "google_api_key": "YOUR_API_KEY"
}
```

#### 3. Product Advertising API Keys (Optional)
**Secret name:** `paapi_keys`
```json
{
  "paapi_public": "YOUR_PUBLIC_KEY",
  "paapi_secret": "YOUR_SECRET_KEY"
}
```

### Optional Dependencies
For PAAPI functionality, you need to download the Amazon Product Advertising API SDK:

1. **Download PAAPI SDK:**
   - Go to [Amazon Product Advertising API SDK](https://webservices.amazon.com/paapi5/documentation/quick-start/using-sdk.html)
   - Download the Python SDK zip file

2. **Setup for Local Development:**
   - Extract the zip file contents into the `agents/travel-agent-langgraph/` directory
   - Install SDK dependencies:
   ```bash
   pip install -r paapi5_python_sdk/requirements.txt
   ```

3. **Setup for Deployment:**
   - Place the downloaded zip file (without extracting) into the `paapi5_python_sdk/` folder in your deployment directory
   - The deployment process will handle the extraction and installation

4. **Enable PAAPI:**
   ```bash
   # Set in your environment or .env file
   USE_PAAPI=true
   ```

**Note:** Without the PAAPI SDK, the agent will use fallback nodes that provide general advice without product search capabilities.

## Usage

### Basic Usage

```python
from agent import TravelAgent

# Initialize the agent
agent = TravelAgent()

# Process a user request
response = agent.run("What should I pack for Barcelona?", user_id="user123")

# Access the response
answer = response['promptResponse']
cart_items = response.get('cartItemsList', [])
```

### Response Format

The agent returns a dictionary with the following structure:

```python
{
    "promptResponse": "Generated response text",
    "wordsToBold": ["highlighted", "words"],
    "cartItemsList": [
        {
            "qty": 1,
            "asin": "B08XYZ123"
        }
    ],
    "promptTitle": "Optional video/link content"
}
```

### State Management

The agent maintains state across conversations including:
- **Chat History**: Previous conversation turns
- **User Profile**: User preferences and information
- **Cart State**: Current wishlist/cart items
- **Conversation ID**: Session tracking

## Testing

Use the provided test notebook to explore all agent capabilities:

```bash
cd agents/tests
jupyter notebook test-travel-agent.ipynb
```

The test notebook includes examples for all 12+ agent capabilities with sample prompts and expected responses.

## License

This project is licensed under the MIT-0 License. See the LICENSE file for details.
