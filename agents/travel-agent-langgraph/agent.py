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

from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Dict, List, Union
from enum import Enum
import time
import boto3
import re
import json

from config import (
    user_table_name, chat_table_name, wishlist_table_name, kb_id,
    USE_PAAPI, paapi_access, paapi_secret,
    nova_lite_llm_converse, nova_pro_llm_converse, AGENT_RT,
    my_api_key, my_cse_id, open_weather_api_key
)
from nodes import (
    IntroNode, InternetSearchNode, AmazonFactsNode, TripRecommendationNode,
    PackingListNode, WeatherNode, ConversationSummaryNode, OrderCartNode,
    ProductSearchNode, RemoveCartNode, AddFromHistoryNode, UserSummaryNode,
    FallbackPackingListNode, FallbackProductSearchNode
)
from prompts import route_prompt_template
from langchain_core.output_parsers import StrOutputParser

class AgentState(TypedDict):
    input: str
    chat_history: List[Dict]
    user_profile: Dict
    conversation_id: str
    user_id: str
    final_output: Dict

class RouteType(Enum):
    INTRO = "intro"
    INTERNET_SEARCH = "internet_search"
    AMAZON_FACTS = "amazon_facts"
    TRIP_REC = "trip_recommendation"
    PACK_LIST = "packing_list"
    WEATHER = "weather"
    CONV_SUMMARY = "conversation_summary"
    ORDER_CART = "order_cart"
    PRODUCT_SEARCH = "product_search"
    REMOVE_CART = "remove_cart"
    ADD_CART = "add_cart"
    USER_SUMMARY = "user_summary"
    GROCERY = "grocery"

class TravelAgent:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.user_table = self.dynamodb.Table(user_table_name)
        self.chat_table = self.dynamodb.Table(chat_table_name)
        self.wishlist_table = self.dynamodb.Table(wishlist_table_name)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(AgentState)
        
        # Create nodes with PAAPI fallback
        if USE_PAAPI and paapi_access and paapi_secret:
            pack_node = PackingListNode(nova_lite_llm_converse, paapi_access, paapi_secret)
            product_node = ProductSearchNode(nova_lite_llm_converse, paapi_access, paapi_secret)
            grocery_node = PackingListNode(nova_lite_llm_converse, paapi_access, paapi_secret)
        else:
            pack_node = FallbackPackingListNode(nova_lite_llm_converse)
            product_node = FallbackProductSearchNode(nova_lite_llm_converse)
            grocery_node = FallbackPackingListNode(nova_lite_llm_converse)

        nodes = {
            RouteType.INTRO: IntroNode(nova_lite_llm_converse),
            RouteType.INTERNET_SEARCH: InternetSearchNode(nova_pro_llm_converse, my_api_key, my_cse_id),
            RouteType.AMAZON_FACTS: AmazonFactsNode(nova_pro_llm_converse),
            RouteType.TRIP_REC: TripRecommendationNode(nova_pro_llm_converse, AGENT_RT, kb_id),
            RouteType.PACK_LIST: pack_node,
            RouteType.WEATHER: WeatherNode(nova_lite_llm_converse, open_weather_api_key),
            RouteType.CONV_SUMMARY: ConversationSummaryNode(nova_pro_llm_converse, chat_table_name, self.dynamodb),
            RouteType.ORDER_CART: OrderCartNode(nova_lite_llm_converse, wishlist_table_name, self.dynamodb),
            RouteType.PRODUCT_SEARCH: product_node,
            RouteType.REMOVE_CART: RemoveCartNode(nova_lite_llm_converse, wishlist_table_name, self.dynamodb),
            RouteType.ADD_CART: AddFromHistoryNode(nova_lite_llm_converse, wishlist_table_name, self.dynamodb),
            RouteType.USER_SUMMARY: UserSummaryNode(nova_pro_llm_converse),
            RouteType.GROCERY: grocery_node
        }

        # Add router node
        graph.add_node("router", self._route)
        
        # Add processing nodes
        for route_type, node in nodes.items():
            graph.add_node(route_type.value, node.process)

        # Add conditional edges from router
        def route_to_node(state):
            return state["next"]
        
        graph.add_conditional_edges(
            "router",
            route_to_node,
            {route_type.value: route_type.value for route_type in nodes.keys()}
        )

        # Add edges from nodes to END
        for route_type in nodes.keys():
            graph.add_edge(route_type.value, END)

        graph.set_entry_point("router")
        
        return graph.compile()
    

    def _route(self, state: AgentState) -> str:

        try:
            router_chain = (route_prompt_template | nova_lite_llm_converse | StrOutputParser()).with_config({"name": "router_chain"})
            pred = router_chain.invoke({"question": state["input"]})
            print(f"Selected route: {pred}")
            next_route = RouteType(pred).value
        except:
            next_route = RouteType.INTRO.value

        # Return the full state with the next route
        return {
            **state,
            "next": next_route
        }

    def _get_user_profile(self, tid="default_user", created_at = 'now') -> Dict:
        try:
            response = self.user_table.get_item(Key={'id': tid, 'createdAt': created_at})
            return response.get('Item')
        except Exception as e:
            print(f"Error getting user profile: {e}")

    def _get_chat_history(self, tid="default_user", cid = "1", created_at = 'now') -> List[Dict]:
        try:
            response = self.chat_table.get_item(Key={'id': cid, 'createdAt': created_at})
            return response.get('Item', {}).get('history', [])
        except Exception as e:
            print(f"Error getting chat history: {e}")
            return []

    def _update_chat_history(self, state: AgentState, tid="default_user", cid = "1", created_at = 'now') -> None:
        try:
            new_messages = [
                {'user': state['input'], 'time': int(time.time())},
                {'bot': state['final_output']['answer'], 'time': int(time.time())}
            ]
            
            self.chat_table.put_item(Item={
                'id': cid,
                'createdAt': created_at,
                'history': state['chat_history'] + new_messages,
                'latest_timestamp': str(time.time())
            })
        except Exception as e:
            print(f"Error updating chat history: {e}")

    def _get_wishlist(self, tid = "default_user", created_at = 'now') -> Dict:
        try:
            response = self.wishlist_table.get_item(Key={'id': tid, 'createdAt': created_at})
            return response.get('Item').get('wishlist', [])
        except Exception as e:
            print(f"Error getting wishlist: {e}")

    def _update_wishlist(self, tid = "default_user", wishlist = [], created_at = 'now') -> None:
        try:
            self.wishlist_table.put_item(Item={
                'id': tid,
                'createdAt': created_at,
                'wishlist': wishlist,
                'latest_timestamp': str(time.time())
            })
        except Exception as e:
            print(f"Error updating wishlist: {e}")

    def run(self, input_text: str, user_id: str) -> Dict:
        state = AgentState(
            input=input_text,
            chat_history=self._get_chat_history(),
            user_profile=self._get_user_profile(),
            conversation_id=f"{user_id}_{int(time.time())}", # TODO: Sync with session id from UI
            user_id=user_id,
            final_output={}
        )
        
        # Log non-sensitive state info only
        print(f"Processing request for user: {state['user_id']}, conversation: {state['conversation_id'][:8]}...")
        result = self.graph.invoke(state)
        self._update_chat_history(result)
        
        response = result['final_output']
        body = {
            "promptResponse": response.get('answer', '').split("<answer>")[-1]
                .replace("</answer>", "")
                .replace("<highlight link>", "")
                .replace("</highlight link>", ""),
            "wordsToBold": response.get('words_to_bold', [])
        }

        # Add cart items if present
        if 'asins' in response:
            body["cartItemsList"] = [
                {
                    "qty": int(item.get("qty", 1)),
                    "asin": item["asin"]
                }
                for item in response['asins']
            ]

        # Add link/video data if present
        if 'link' in response:
            body["promptTitle"] = _video_markdown(response['link'])
        elif 'video_data' in response:
            body["promptTitle"] = _video_markdown(response['video_data'])

        return body

def _video_markdown(text):
    url_regexs = re.compile(r"(?P<url>https?://[^\s]+)")
    return re.sub(url_regexs,
        r'<iframe width="560" height="315" src=\1 frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>', text)
