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

import os
import boto3
import json
from botocore.config import Config
from langchain_aws import ChatBedrockConverse

#################### ENV VARIABLES ####################

user_table_name = os.environ['USER_TABLE_NAME']
wishlist_table_name = os.environ['WISHLIST_TABLE_NAME']
chat_table_name = os.environ['CHAT_TABLE_NAME']
kb_id = os.environ['KNOWLEDGE_BASE_ID']
region_name = os.environ['AWS_REGION']
print(f"Region: {region_name}")

OPENWEATHER_SECRET_NAME = os.environ['OPENWEATHER_SECRET_NAME']
PAAPI_SECRET_NAME = os.environ['PAAPI_SECRET_NAME']
GOOGLE_SEARCH_SECRET_NAME = os.environ['GOOGLE_SEARCH_SECRET_NAME']

#################### KEYS AND SECRETS ####################

# Check if PAAPI should be enabled
USE_PAAPI = os.environ.get('USE_PAAPI', 'false').lower() == 'true'

def get_secret(secret_name: str):
    client = boto3.session.Session().client('secretsmanager', region_name=region_name)
    return client.get_secret_value(SecretId=secret_name)['SecretString']

# retrieve keys
open_weather_api_key = json.loads(get_secret(OPENWEATHER_SECRET_NAME))['openweather_key']
google_search_keys = json.loads(get_secret(GOOGLE_SEARCH_SECRET_NAME))

my_api_key = google_search_keys["google_api_key"]
my_cse_id = google_search_keys["cse_id"]

# PAAPI keys (optional)
if USE_PAAPI:
    try:
        paapi_keys = json.loads(get_secret(PAAPI_SECRET_NAME))
        paapi_access = paapi_keys["paapi_public"]
        paapi_secret = paapi_keys["paapi_secret"]
        partner_tag= paapi_keys["partner_tag"]
        print("PAAPI enabled")
    except Exception as e:
        print(f"PAAPI setup failed: {e}")
        USE_PAAPI = False
        paapi_access = None
        paapi_secret = None
else:
    print("PAAPI disabled")
    paapi_access = None
    paapi_secret = None

#################### AWS CLIENT CONFIG ####################

BEDROCK_CONFIG = Config(
    region_name=region_name,
    signature_version='v4',
    read_timeout=500,
    retries={
        'max_attempts': 10,
        'mode': 'adaptive'
    }
)

BEDROCK_RT = boto3.client("bedrock-runtime", config=BEDROCK_CONFIG)
AGENT_RT = boto3.client('bedrock-agent-runtime', config = BEDROCK_CONFIG)

#################### LLM CONFIG ####################

NOVA_LITE_MODEL_ID = "amazon.nova-lite-v1:0"
NOVA_PRO_MODEL_ID = "amazon.nova-pro-v1:0"

model_kwargs =  { 
    "max_tokens": 2048,
    "temperature": 0.0,
    "top_p": 1,
    "stop_sequences": ["Human"],
}

nova_pro_llm_converse = ChatBedrockConverse(
    client=BEDROCK_RT,
    model=NOVA_PRO_MODEL_ID,
    **model_kwargs,
)
nova_lite_llm_converse = ChatBedrockConverse(
    client=BEDROCK_RT,
    model=NOVA_LITE_MODEL_ID,
    **model_kwargs,
)
