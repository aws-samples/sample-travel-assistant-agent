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

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List
import time
import re
from langchain_core.output_parsers import StrOutputParser
from bs4 import BeautifulSoup
from googleapiclient.discovery import build
import requests
# Optional PAAPI imports
try:
    from paapi5_python_sdk.api.default_api import DefaultApi
    from paapi5_python_sdk.models.partner_type import PartnerType
    from paapi5_python_sdk.models.search_items_request import SearchItemsRequest
    from paapi5_python_sdk.models.search_items_resource import SearchItemsResource
    PAAPI_AVAILABLE = True
except ImportError:
    print("PAAPI SDK not available - using fallback nodes")
    PAAPI_AVAILABLE = False

from prompts import *
from config import *

import json
import ast

class BaseNode(ABC):
    def __init__(self, llm, dynamodb: Optional[Any] = None):
        self.llm = llm
        self.dynamodb = dynamodb

    @abstractmethod
    def process(self, state: Dict) -> Dict:
        pass

    def handle_error(self, error: Exception, state: Dict) -> Dict:
        state["error"] = str(error)
        state["final_output"] = {"answer": f"Error: {str(error)}"}
        return state
    
    def get_dynamo_item(self, table_name: str, key: Dict) -> Optional[Dict]:
        print(f"Getting item from DynamoDB: table name {table_name} and key {key}")
        try:
            if not self.dynamodb:
                return None
            table = self.dynamodb.Table(table_name)
            response = table.get_item(Key=key)
            return response.get('Item')
        except Exception as e:
            print(f"DynamoDB get error: {e}")
            return None

    def put_dynamo_item(self, table_name: str, item: Dict) -> bool:
        try:
            if not self.dynamodb:
                return False
            table = self.dynamodb.Table(table_name)
            table.put_item(Item=item)
            return True
        except Exception as e:
            print(f"DynamoDB put error: {e}")
            return False

    @staticmethod
    def safe_parse_json(input_str: str) -> Optional[Any]:
        # Try JSON parse
        try: return json.loads(input_str)
        except json.JSONDecodeError: pass
        
        # Try JSON from code blocks
        m = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```|\{[\s\S]*\}', input_str)
        if m:
            try: return json.loads(m.group(1) or m.group(0))
            except json.JSONDecodeError: pass
        
        # Try Python literal
        try: return ast.literal_eval(input_str)
        except (ValueError, SyntaxError): pass
        
        # Try key-value extraction
        try: return dict(re.findall(r'(\w+)\s*[:=]\s*([^,}\s]+)', input_str))
        except ValueError: pass
    
    @staticmethod
    def safe_parse_python(input_str):
        match = re.search(r'<python>([\s\S]*?)</python>', input_str)
        if match:
            try:
                return ast.literal_eval(match.group(1).strip())
            except (ValueError, SyntaxError):
                return None
        return None

    @staticmethod
    def remove_duplicates(items: List[Dict]) -> List[Dict]:
        seen = set()
        return [x for x in items if tuple(sorted(x.items())) not in seen and not seen.add(tuple(sorted(x.items())))]

    def invoke_chain(self, chain: Any, inputs: Dict) -> str:
        chain_name = getattr(chain, 'config', {}).get('name')
        print(f"[{self.__class__.__name__}] Invoking chain: {chain_name}")
        try:
            return chain.invoke(inputs)
        except Exception as e:
            print(f"Chain error: {e}")
            return ""


class IntroNode(BaseNode):
    def __init__(self, llm):
        super().__init__(llm)
        self.chain = (intro_prompt | self.llm | StrOutputParser()).with_config({"name": "intro_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            state["final_output"] = {
                "answer": self.invoke_chain(self.chain, {
                    "input": state["input"],
                    "user_profile": state.get("user_profile", {}),
                    "previous_chat": state["chat_history"][-20:]
                })
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)


class InternetSearchNode(BaseNode):
    def __init__(self, llm, google_api_key: str, google_cse_id: str):
        super().__init__(llm)
        self.google_api_key = google_api_key
        self.google_cse_id = google_cse_id
        self.chain = (search_internet_prompt_template | self.llm | StrOutputParser()).with_config({"name": "search_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Get search results and content
            search_result = self._google_search(state["input"])[0]
            webpage_content = self._get_webpage_content(search_result['link'])

            # Generate answer
            state["final_output"] = {
                "answer": self.invoke_chain(self.chain, {
                    "input": state["input"],
                    "search_res": webpage_content,
                    "previous_chat": state["chat_history"][-20:]
                }),
                "link": search_result['link']
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)

    def _get_webpage_content(self, url: str) -> str:
        response = requests.get(url, timeout=10)
        return BeautifulSoup(response.content, 'html.parser').get_text()

    def _google_search(self, query: str, num_results: int = 5) -> list:
        return build("customsearch", "v1", developerKey=self.google_api_key).cse().list(
            q=query,
            cx=self.google_cse_id,
            num=num_results
        ).execute()['items']


class AmazonFactsNode(BaseNode):
    def __init__(self, llm):
        super().__init__(llm)
        self.chain = (amazon_facts_prompt_template | self.llm | StrOutputParser()).with_config({"name": "facts_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            state["final_output"] = {
                "answer": self.invoke_chain(self.chain, {
                    "input": state["input"],
                    "user_profile": state.get("user_profile", {})
                })
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)


class TripRecommendationNode(BaseNode):
    def __init__(self, llm, agent_client, kb_id: str):
        super().__init__(llm)
        self.agent_client = agent_client
        self.kb_id = kb_id
        self.chain = (trip_rec_prompt_template | self.llm | StrOutputParser()).with_config({"name": "trip_rec_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Get vector search results
            docs = self.agent_client.retrieve(
                knowledgeBaseId=self.kb_id,
                retrievalQuery={"text": state["input"]},
                retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 3}}
            )
            print(f"Vector search results: {docs}")

            # Extract results and links
            results = []
            links = []
            for doc in docs['retrievalResults']:
                results.append(doc['content']['text'])
                links.append(doc['location']['s3Location']['uri'])

            print(f"RAG results: {results}")

            # Generate recommendation
            state["final_output"] = {
                "answer": self.invoke_chain(self.chain, {
                    "input": state["input"],
                    "search_res": results,
                    "user_profile": state.get("user_profile", {}),
                    "previous_chat": state["chat_history"][-20:]
                }),
                "links": links
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)


class PackingListNode(BaseNode):
    def __init__(self, llm, paapi_access: str, paapi_secret: str, partner_tag: str):
        super().__init__(llm)
        if not PAAPI_AVAILABLE:
            raise ImportError("PAAPI SDK not available")
        self.paapi = DefaultApi(
            access_key=paapi_access,
            secret_key=paapi_secret,
            host="webservices.amazon.com",
            region=region_name
        )
        self.paapi_partner_tag = partner_tag
        self.pack_chain = (amazon_pack_template | self.llm | StrOutputParser()).with_config({"name": "pack_chain"})
        self.format_chain = (amazon_search_format_template | self.llm | StrOutputParser()).with_config({"name": "format_chain"})
        self.consolidate_chain = (consolidate_cart_prompt_template | self.llm | StrOutputParser()).with_config({"name": "consolidate_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Generate packing list
            pack_list = self.invoke_chain(self.pack_chain, {
                "input": state["input"],
                "user_profile": state.get("user_profile", {}),
                "previous_chat": state["chat_history"][-20:]
            })

            # Search products and get ASINs
            asins = []
            search_prods = []

            for item in self.safe_parse_python(pack_list) or []:
                search_results = self._search_products(item)
                search_prods.append(search_results['products'])
                asins.extend(search_results['asins'])

            # Format and consolidate results
            formatted_answer = self.invoke_chain(self.format_chain, {
                "input": state["input"],
                "prod_search": search_prods,
                "user_profile": state.get("user_profile", {}),
                "previous_chat": state["chat_history"][-20:]
            })

            asins_response = self.invoke_chain(self.consolidate_chain, {
                    "cart": asins,
                    "answer": formatted_answer
                })
            
            asins_dict = self.safe_parse_json(asins_response)
                        
            state["final_output"] = {
                "answer": formatted_answer,
                "asins": asins_dict
            }

            return state
            
        except Exception as e:
            return self.handle_error(e, state)

    def _search_products(self, query: str) -> Dict:
        print(f"Searching for products: {query}")
        search_results = self.paapi.search_items(SearchItemsRequest(
            partner_tag=self.paapi_partner_tag,
            partner_type=PartnerType.ASSOCIATES,
            keywords=query,
            search_index="All",
            item_count=2,
            resources=[
                SearchItemsResource.ITEMINFO_TITLE,
                SearchItemsResource.OFFERS_LISTINGS_PRICE,
                SearchItemsResource.CUSTOMERREVIEWS_STARRATING,
                SearchItemsResource.CUSTOMERREVIEWS_COUNT,
            ]
        ))
        
        products = []
        asins = []
        
        for item in search_results.search_result.items:
            try:
                asins.append({
                    "asin": item.asin,
                    "qty": "1",
                    "title": item.item_info.title.display_value,
                    "price": str(item.offers.listings[0].price.amount),
                    # "reviews": str(item.customer_reviews.star_rating.value)
                })
                
                products.append({
                    "asin": item.asin,
                    "detail_page_url": item.detail_page_url,
                    "title": item.item_info.title,
                    "price": item.offers,
                    # "customer_reviews": item.customer_reviews
                })
            except (AttributeError, KeyError, IndexError) as e:
                print(f"Error processing item {item.asin}: {e}")
                continue
        print(f"Search results: {products}")
        return {"products": products, "asins": asins}

class WeatherNode(BaseNode):
    def __init__(self, llm, openweather_api_key: str):
        super().__init__(llm)
        self.api_key = openweather_api_key
        self.location_chain = (longlat_prompt_template | self.llm | StrOutputParser()).with_config({"name": "location_chain"})
        self.weather_chain = (weather_prompt_template | self.llm | StrOutputParser()).with_config({"name": "weather_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Get location coordinates
            location_response = self.invoke_chain(self.location_chain, {
                "input": state["input"],
                "user_profile": state.get("user_profile", {})
            })
            location = self.safe_parse_json(location_response)

            # Get weather data
            weather_data = self._get_weather_data(location)

            # Generate response
            state["final_output"] = {
                "answer": self.invoke_chain(self.weather_chain, {
                    "input": state["input"],
                    "search_res": weather_data,
                    "previous_chat": state["chat_history"][-20:]
                })
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)

    def _get_weather_data(self, location: Dict) -> list:
        response = requests.get(
            f"https://api.openweathermap.org/data/2.5/forecast",
            params={
                "lat": location["latitude"],
                "lon": location["longitude"],
                "appid": self.api_key
            },
            timeout=10
        ).json()

        return [{
            "datetime": item['dt_txt'],
            "temperature": (item['main']['temp'] - 273.15) * 9/5 + 32,
            "pressure": item['main']['pressure'],
            "humidity": item['main']['humidity'],
            "weather": item['weather'][0]['description'],
            "wind": item['wind'],
            "clouds": item["clouds"]
        } for item in response["list"]]


class ConversationSummaryNode(BaseNode):
    def __init__(self, llm, chat_table: str, email_config: Dict = None):
        super().__init__(llm)
        self.chat_table = chat_table
        self.email_config = email_config or {}
        self.chain = (summarize_conversation_template | self.llm | StrOutputParser()).with_config({"name": "summary_chain"})


    def process(self, state: Dict) -> Dict:
        try:
            summary = self.invoke_chain(self.chain, {
                "input": state["input"],
                "previous_chat": state.get("chat_history", [])[-10],
                "user_profile": state.get("user_profile", {})
            })        

            # Send email if configured
            if self.email_config:
                self._send_email(summary)

            state["final_output"] = {"answer": summary}
            return state
            
        except Exception as e:
            return self.handle_error(e, state)

    def _send_email(self, summary: str) -> None:
        # Implement your email sending logic here
        # Example placeholder:
        """
        send_email(
            from_email=self.email_config.get("from_email"),
            to_email=self.email_config.get("to_email"),
            subject=self.email_config.get("subject", "Conversation Summary"),
            body=summary
        )
        """
        pass


class OrderCartNode(BaseNode):
    def __init__(self, llm, wishlist_table: str, dynamodb=None):
        super().__init__(llm, dynamodb)
        self.wishlist_table = wishlist_table
        self.chain = (order_cart_template | self.llm | StrOutputParser()).with_config({"name": "order_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            wishlist = self.get_dynamo_item(self.wishlist_table, {
                "id": state.get("user_id", "default_user"),
                "createdAt": "now"
            })

            cart_summary = self.invoke_chain(self.chain, {
                "input": state["input"],
                "user_cart": wishlist.get("wishlist", []) if wishlist else [],
                "previous_chat": state["chat_history"][-20:]
            })

            state["final_output"] = {
                "answer": cart_summary,
                "asins": wishlist.get("wishlist", []) if wishlist else []
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)


class ProductSearchNode(BaseNode):
    def __init__(self, llm, paapi_access: str, paapi_secret: str, partner_tag: str):
        super().__init__(llm)
        if not PAAPI_AVAILABLE:
            raise ImportError("PAAPI SDK not available")
        self.paapi = DefaultApi(
            access_key=paapi_access,
            secret_key=paapi_secret,
            host="webservices.amazon.com",
            region=region_name
        )
        self.paapi_partner_tag = partner_tag
        self.format_chain = (amazon_search_format_template | self.llm | StrOutputParser()).with_config({"name": "format_chain"})
        self.search_chain = (amazon_search_template | self.llm | StrOutputParser()).with_config({"name": "search_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Get search query and perform search
            search_query = self.invoke_chain(self.search_chain, {
                "input": state["input"],
                "user_profile": state.get("user_profile", {}),
                "previous_chat": state["chat_history"][-20:]
            })
            
            search_results = self._search_products(search_query)
            
            # Format response
            response = self.invoke_chain(self.format_chain, {
                "input": state["input"],
                "prod_search": search_results["products"],
                "user_profile": state.get("user_profile", {}),
                "previous_chat": state["chat_history"][-20:]
            })

            state["final_output"] = {
                "answer": response,
                "asins": search_results["asins"]
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)

    def _search_products(self, query: str) -> Dict:
        try:
            search_results = self.paapi.search_items(SearchItemsRequest(
                partner_tag=self.paapi_partner_tag,
                partner_type=PartnerType.ASSOCIATES,
                keywords=query.replace("\n", "").replace("<entity>", "").replace("</entity>", ""),
                search_index="All",
                item_count=4,
                resources=[
                    SearchItemsResource.ITEMINFO_TITLE,
                    SearchItemsResource.OFFERS_LISTINGS_PRICE,
                    SearchItemsResource.CUSTOMERREVIEWS_STARRATING,
                    SearchItemsResource.CUSTOMERREVIEWS_COUNT,
                ]
            ))
            
            products = []
            asins = []
            
            for item in search_results.search_result.items:
                try:
                    asins.append({
                        "asin": item.asin,
                        "qty": "1",
                        "title": item.item_info.title.display_value,
                        "price": str(item.offers.listings[0].price.amount),
                        # "reviews": str(item.customer_reviews.star_rating.value)
                    })
                    
                    products.append({
                        "asin": item.asin,
                        "detail_page_url": item.detail_page_url,
                        "title": item.item_info.title,
                        "price": item.offers,
                        # "customer_reviews": item.customer_reviews
                    })
                except Exception as e:
                    print(f"Error processing search item: {e}")
                    continue
                    
            return {"products": products, "asins": asins}
            
        except Exception as e:
            print(f"Search error: {e}")
            return {"products": [], "asins": []}


class RemoveCartNode(BaseNode):
    def __init__(self, llm, wishlist_table: str, dynamodb=None):
        super().__init__(llm, dynamodb)
        self.wishlist_table = wishlist_table
        self.remove_chain = (remove_cart_prompt_template | self.llm | StrOutputParser()).with_config({"name": "remove_chain"})
        self.confirm_chain = (confirm_cart_removal_prompt_template | self.llm | StrOutputParser()).with_config({"name": "confirm_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            # Get current wishlist and process removals
            existing_list = self.get_dynamo_item(self.wishlist_table, {
                "id": state.get("user_id", "default_user"),
                "createdAt": "now"
            })
            current_list = existing_list.get("wishlist", []) if existing_list else []
            
            # Remove items and update
            updated_cart = self._process_removals(state, current_list)
            
            self.put_dynamo_item(self.wishlist_table, {
                "id": state.get("user_id", "default_user"),
                "createdAt": "now",
                "wishlist": updated_cart,
                "latest_timestamp": str(time.time())
            })

            # Generate confirmation
            state["final_output"] = {
                "answer": self.invoke_chain(self.confirm_chain, {
                    "input": state["input"],
                    "cart": updated_cart
                }),
                "asins": current_list
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)

    def _process_removals(self, state: Dict, current_list: List) -> List:
        removed_items = self.safe_parse_json(self.invoke_chain(self.remove_chain, {
            "input": state["input"],
            "previous_chat": state["chat_history"][-20:],
            "cart": current_list
        })) or []

        # Process and deduplicate
        wishlist = []
        for item in removed_items:
            item["qty"] = int(item.get("qty", 1))
            wishlist.append(item)
        
        current_list.extend(wishlist)
        return self.remove_duplicates(wishlist)


class AddFromHistoryNode(BaseNode):
    def __init__(self, llm, wishlist_table: str, dynamodb=None):
        super().__init__(llm, dynamodb)
        self.wishlist_table = wishlist_table
        self.chain = (add_from_previous_chat_prompt_template | self.llm | StrOutputParser()).with_config({"name": "add_history_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            existing_list = self.get_dynamo_item(
                self.wishlist_table, 
                {"id": state.get("user_id", "default_user"), "createdAt": "now"}
            )
            current_list = existing_list.get("wishlist", []) if existing_list else []

            # Process items from chat history
            new_items = self.safe_parse_json(self.invoke_chain(self.chain, {
                "input": state["input"],
                "previous_chat": state["chat_history"][-20:]
            })) or []
            print(f"new_items: {new_items}")

            # Update wishlist
            current_list.extend(new_items)
            updated_list = self.remove_duplicates(current_list)
            print(f"updated_list: {updated_list}")
            
            self.put_dynamo_item(self.wishlist_table, {
                "id": state.get("user_id", "default_user"),
                "createdAt": "now",
                "wishlist": updated_list,
                "latest_timestamp": str(time.time())
            })

            state["final_output"] = {
                "answer": "I have updated your cart, is there anything else I can do for you?",
                "asins": updated_list
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)
        

class UserSummaryNode(BaseNode):
    def __init__(self, llm):
        super().__init__(llm)
        self.chain = (user_summary_prompt_template | self.llm | StrOutputParser()).with_config({"name": "user_summary_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            state["final_output"] = {
                "answer": self.invoke_chain(self.chain, {
                    "input": state["input"],
                    "user_profile": state.get("user_profile", {})
                })
            }
            return state
            
        except Exception as e:
            return self.handle_error(e, state)


class FallbackPackingListNode(BaseNode):
    """Fallback node when PAAPI is disabled"""
    def __init__(self, llm):
        super().__init__(llm)
        self.chain = (intro_prompt | self.llm | StrOutputParser()).with_config({"name": "fallback_pack_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            state["final_output"] = {
                "answer": "I'd love to help you create a packing list, but Amazon product search is currently disabled. I can provide general packing advice instead! What type of trip are you planning?"
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)


class FallbackProductSearchNode(BaseNode):
    """Fallback node when PAAPI is disabled"""
    def __init__(self, llm):
        super().__init__(llm)
        self.chain = (intro_prompt | self.llm | StrOutputParser()).with_config({"name": "fallback_search_chain"})

    def process(self, state: Dict) -> Dict:
        try:
            state["final_output"] = {
                "answer": "Amazon product search is currently disabled. I can help you with travel recommendations, weather information, or general travel advice instead!"
            }
            return state
        except Exception as e:
            return self.handle_error(e, state)
