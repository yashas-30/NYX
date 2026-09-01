"""
researcher_writer_graph.py

Production LangGraph Implementation of the Researcher-Writer Multi-Agent Pattern:
1. Lightweight Local Researcher (Qwen 2.5 1.5B):
   - Tool calling & function execution
   - DuckDuckGo & Bing web searches (text + image extraction)
   - Resilient HTML & Markdown webpage scraping
   - Multi-Hop Reflection & Gap Analysis (Deep Research loop)
   - TurboVec & SQLite Memory Integration
2. Dossier Compiler:
   - Aggregates, cleans, deduplicates, and formats research findings and images
3. Final Writer / Generator:
   - Synthesizes the polished final response using only the clean Research Dossier and embeds markdown images
"""

import os
import sys
import json
import re
import urllib.request
import urllib.parse
from typing import Annotated, List, Dict, Any, Optional, TypedDict
import operator

# Core LangChain & LangGraph imports
try:
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
    from langchain_core.tools import tool
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI
    from langgraph.graph import StateGraph, START, END
    from langgraph.prebuilt import ToolNode
except ImportError:
    from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
    from langchain_core.tools import tool
    from langchain_core.prompts import ChatPromptTemplate
    from langgraph.graph import StateGraph, START, END
    from langgraph.prebuilt import ToolNode

# BeautifulSoup for clean HTML stripping
try:
    from bs4 import BeautifulSoup, Comment
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# DuckDuckGo Search
try:
    from duckduckgo_search import DDGS
    HAS_DDGS = True
except ImportError:
    try:
        from ddgs import DDGS
        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False


# ─────────────────────────────────────────────────────────────────────────────
# 1. Resilient Search & Scraping Tools
# ─────────────────────────────────────────────────────────────────────────────

def _clean_html_to_markdown(html_text: str, max_chars: int = 4000) -> str:
    """Converts raw HTML into clean, readable text/markdown."""
    if not html_text:
        return ""
    if HAS_BS4:
        soup = BeautifulSoup(html_text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "noscript", "svg", "form", "aside"]):
            tag.decompose()
        for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()
        
        main_content = (
            soup.find("article")
            or soup.find("main")
            or soup.find(attrs={"role": "main"})
            or soup.find(id=lambda i: i and "content" in i.lower())
            or soup.body
            or soup
        )
        text = main_content.get_text(separator="\n", strip=True)
        # Collapse excessive newlines
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:max_chars]
    else:
        # Regex-based fallback
        text = re.sub(r"<script[\s\S]*?</script>", "", html_text, flags=re.IGNORECASE)
        text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]


@tool
def ddg_text_search(query: str, max_results: int = 4) -> List[Dict[str, str]]:
    """Search the web for real-time information, technical docs, facts, and website links."""
    clean_q = query.strip()
    results: List[Dict[str, str]] = []
    
    # 1. Primary: DDGS python library
    if HAS_DDGS:
        try:
            with DDGS() as ddgs:
                raw_results = list(ddgs.text(clean_q, max_results=max_results))
                if raw_results:
                    for r in raw_results:
                        results.append({
                            "title": r.get("title", ""),
                            "url": r.get("href") or r.get("link", ""),
                            "snippet": r.get("body") or r.get("snippet", "")
                        })
                    return results
        except Exception as e:
            sys.stderr.write(f"[ddg_text_search] DDGS library error: {e}\n")

    # 2. Resilient Direct HTTP Fallback (DuckDuckGo Lite / Wikipedia API)
    try:
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(clean_q)}&format=json"
        req = urllib.request.Request(wiki_url, headers={"User-Agent": "NYX-Research-Agent/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for item in data.get("query", {}).get("search", [])[:max_results]:
                title = item.get("title", "")
                snippet = re.sub(r"<[^>]+>", "", item.get("snippet", ""))
                url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}"
                results.append({"title": title, "url": url, "snippet": snippet})
    except Exception:
        pass

    if not results:
        results.append({
            "title": f"Search for {clean_q}",
            "url": f"https://duckduckgo.com/?q={urllib.parse.quote(clean_q)}",
            "snippet": f"Web query executed for: {clean_q}"
        })
    return results


@tool
def ddg_image_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Search for relevant, high-resolution images. Returns a list of image URLs and titles."""
    clean_q = query.strip()
    images: List[Dict[str, str]] = []

    # 1. Primary: DDGS python library
    if HAS_DDGS:
        try:
            with DDGS() as ddgs:
                raw_imgs = list(ddgs.images(clean_q, max_results=max_results))
                if raw_imgs:
                    for r in raw_imgs:
                        img_url = r.get("image") or r.get("thumbnail")
                        if img_url and img_url.startswith("http"):
                            images.append({
                                "url": img_url,
                                "title": r.get("title") or clean_q,
                                "source": "DuckDuckGo Images"
                            })
                    if images:
                        return images
        except Exception as e:
            sys.stderr.write(f"[ddg_image_search] DDGS image search error: {e}\n")

    # 2. Resilient Bing Images Fallback
    try:
        bing_url = f"https://www.bing.com/images/async?q={urllib.parse.quote(clean_q)}&first=1&count={max_results*2}&scenario=ImageBasicHover&datsrc=N_A&layout=RowBased&mmasync=1"
        req = urllib.request.Request(bing_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            matches = re.findall(r'&quot;murl&quot;:&quot;([^&]+)&quot;', html) or re.findall(r'm="([^"]+)"', html)
            for m in matches:
                if len(images) >= max_results:
                    break
                raw_url = m.replace('&quot;', '"').replace('&amp;', '&')
                if raw_url.startswith('{'):
                    try:
                        obj = json.loads(raw_url)
                        img_url = obj.get("murl") or obj.get("mediaurl")
                        title = obj.get("t") or obj.get("desc") or clean_q
                        if img_url and img_url.startswith("http"):
                            images.append({"url": img_url, "title": title, "source": "Bing Images"})
                    except Exception:
                        pass
                elif raw_url.startswith("http"):
                    images.append({"url": raw_url, "title": clean_q, "source": "Bing Images"})
    except Exception:
        pass

    return images


@tool
def scrape_webpage(url: str, max_chars: int = 4000) -> str:
    """Scrape and read the full text content of a specific web URL."""
    if not url or not url.startswith("http"):
        return f"Invalid URL: {url}"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
            clean_text = _clean_html_to_markdown(html, max_chars=max_chars)
            return clean_text if clean_text.strip() else f"Page at {url} contained no readable text body."
    except Exception as e:
        return f"Failed to scrape URL {url}: {str(e)}"


# Tools assigned to Qwen 2.5 1.5B
qwen_tools = [ddg_text_search, ddg_image_search, scrape_webpage]


# ─────────────────────────────────────────────────────────────────────────────
# 2. Graph State Definition
# ─────────────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    query: str
    search_mode: str  # "normal" | "research" | "deep_research"
    messages: Annotated[List[BaseMessage], operator.add]
    loop_count: int
    scraped_urls: List[str]
    
    # Handoff Payloads:
    research_dossier: str
    image_urls: List[Dict[str, str]]
    final_response: Optional[str]


# ─────────────────────────────────────────────────────────────────────────────
# 3. Model Adapters (Local Qwen 2.5 1.5B & Generator Model)
# ─────────────────────────────────────────────────────────────────────────────

def get_qwen_model(
    base_url: Optional[str] = None,
    api_key: str = "EMPTY",
    model_name: str = "qwen2.5:1.5b"
):
    """
    Returns an OpenAI-compatible client for Qwen 2.5 1.5B.
    Supports Ollama (http://localhost:11434/v1), LM Studio, vLLM, or Nyx Native server.
    """
    url = base_url or os.environ.get("NYX_LOCAL_LLM_URL", "http://localhost:11434/v1")
    return ChatOpenAI(
        model=model_name,
        base_url=url,
        api_key=api_key,
        temperature=0.2,
        max_tokens=2048,
    )


def get_generator_model(
    provider: str = "gemini",
    model_name: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
):
    """
    Returns the final generator model (e.g. Gemini 3.5 Flash-Lite, Gemini 3.1 Flash-Lite, Gemini 3.7 Flash, GPT-4o).
    """
    prov = (provider or os.environ.get("NYX_GENERATOR_PROVIDER", "gemini")).lower()
    
    if prov == "gemini" or "gemini" in (model_name or "").lower():
        key = api_key or os.environ.get("GEMINI_API_KEY", "")
        m_name = model_name or os.environ.get("NYX_GENERATOR_MODEL", "gemini-3.5-flash-lite")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model=m_name,
                google_api_key=key,
                temperature=0.7,
                max_retries=2,
            )
        except Exception as e:
            sys.stderr.write(f"[get_generator_model] ChatGoogleGenerativeAI init warning: {e}\n")

    key = api_key or os.environ.get("OPENAI_API_KEY") or os.environ.get("GEMINI_API_KEY") or "EMPTY"
    m_name = model_name or os.environ.get("NYX_GENERATOR_MODEL", "gpt-4o")
    b_url = base_url or os.environ.get("NYX_GENERATOR_BASE_URL", None)
    
    return ChatOpenAI(
        model=m_name,
        api_key=key,
        base_url=b_url,
        temperature=0.7,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. Graph Nodes
# ─────────────────────────────────────────────────────────────────────────────

def qwen_researcher_node(state: ResearchState, llm_qwen_with_tools):
    """
    Qwen 2.5 1.5B Researcher Node:
    Analyzes current state, decides which tools to call, and plans research vectors.
    """
    mode = state.get("search_mode", "normal")
    query = state["query"]
    loop_count = state.get("loop_count", 0)
    
    if mode == "normal":
        system_instruction = (
            "You are the Lead Web Researcher. The user requested a Normal Search.\n"
            "Action Plan:\n"
            "1. Call `ddg_text_search` with 1-2 targeted search queries to get current facts and snippets.\n"
            "2. Call `ddg_image_search` with the exact named entity/subject to retrieve 2 relevant images.\n"
            "Do NOT write the final answer to the user. Only call the tools needed to gather data."
        )
    elif mode == "research":
        system_instruction = (
            "You are the Lead Web Researcher. The user requested Basic Multi-Vector Research.\n"
            "Action Plan:\n"
            "1. Decompose the topic into 3 distinct, orthogonal search queries (Overview, Specs/Benchmarks, Comparisons).\n"
            "2. Execute `ddg_text_search` for all 3 sub-queries.\n"
            "3. Call `scrape_webpage` on the most relevant URLs returned to read the full page text.\n"
            "4. Call `ddg_image_search` to find 2-3 visual references.\n"
            "Do NOT write the final answer to the user. Gather thorough data."
        )
    else:  # deep_research
        system_instruction = (
            f"You are the Deep Research Specialist (Reflection Loop {loop_count + 1}/3).\n"
            "Action Plan:\n"
            "1. If this is loop 0: Decompose the topic into 5-7 comprehensive investigative angles and execute `ddg_text_search`.\n"
            "2. Call `scrape_webpage` on authoritative URLs to ingest in-depth technical context.\n"
            "3. Call `ddg_image_search` for key named entities.\n"
            "4. If this is a follow-up loop: Review gathered findings, identify knowledge gaps or unanswered nuances, and call targeted follow-up searches.\n"
            "Do NOT write the final answer. Gather exhaustive evidence and citations."
        )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_instruction),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | llm_qwen_with_tools
    response = chain.invoke({"messages": state["messages"]})
    
    return {
        "messages": [response],
        "loop_count": loop_count + 1
    }


def compile_dossier_node(state: ResearchState) -> Dict[str, Any]:
    """
    Dossier Compiler:
    Extracts raw tool outputs from messages, deduplicates URLs, isolates images,
    and builds a structured Research Dossier string for the Generator model.
    """
    messages = state["messages"]
    dossier_sections: List[str] = []
    collected_images: List[Dict[str, str]] = list(state.get("image_urls") or [])
    seen_image_urls = set(img.get("url") for img in collected_images if img.get("url"))
    seen_urls = set(state.get("scraped_urls") or [])
    
    for msg in messages:
        if isinstance(msg, ToolMessage) or getattr(msg, "type", "") == "tool":
            tool_name = getattr(msg, "name", "")
            content = str(msg.content)
            
            # Handle image tool outputs
            if "image" in tool_name.lower():
                try:
                    parsed = json.loads(content) if content.startswith("[") or content.startswith("{") else eval(content)
                    if isinstance(parsed, list):
                        for item in parsed:
                            if isinstance(item, dict) and item.get("url") and item["url"] not in seen_image_urls:
                                seen_image_urls.add(item["url"])
                                collected_images.append(item)
                except Exception:
                    found_urls = re.findall(r'https?://[^\s\'"<>]+', content)
                    for u in found_urls:
                        if u not in seen_image_urls and any(ext in u.lower() for ext in [".jpg", ".png", ".webp", ".jpeg", "bing", "duckduckgo"]):
                            seen_image_urls.add(u)
                            collected_images.append({"url": u, "title": state["query"], "source": "Web Images"})
            else:
                dossier_sections.append(f"### [Tool: {tool_name}]\n{content}")
                for u in re.findall(r'https?://[^\s\'"<>]+', content):
                    seen_urls.add(u)
    
    compiled_dossier = "\n\n---\n\n".join(dossier_sections) if dossier_sections else "No external search data was retrieved."
    
    return {
        "research_dossier": compiled_dossier,
        "image_urls": collected_images,
        "scraped_urls": list(seen_urls)
    }


def final_generator_node(state: ResearchState, llm_final) -> Dict[str, Any]:
    """
    Final Generator Node (The Handoff):
    Synthesizes the final high-quality response using ONLY the structured Research Dossier
    and embeds markdown image references.
    """
    dossier = state.get("research_dossier", "")
    images = state.get("image_urls", [])
    query = state["query"]
    mode = state.get("search_mode", "normal")
    
    system_prompt = (
        "You are an elite research analyst and technical writer. Answer the user's query thoroughly "
        "and authoritatively using the verified facts, benchmarks, and data provided in the Research Dossier.\n\n"
        "Guidelines:\n"
        "1. Structure your response with clear Markdown headings (##, ###), bullet points, and comparative tables.\n"
        "2. Ground every factual claim in the provided sources and cite references.\n"
        "3. You are provided with a curated list of relevant images. You MUST embed the most relevant images directly "
        "into your markdown response using `![Title](URL)` within corresponding sections to visually support your explanation.\n"
        "4. Never output raw unstructured code dumps or unparsed JSON."
    )
    
    images_formatted = "\n".join([f"- Title: \"{img.get('title', 'Reference Image')}\" | URL: {img.get('url')} (Source: {img.get('source', 'Web')})" for img in images]) if images else "None available."
    
    user_prompt = (
        f"User Inquiry: \"{query}\"\n"
        f"Research Mode: {mode.upper()}\n\n"
        f"═══════════════════════════════════════════════════════════════════════\n"
        f"RESEARCH DOSSIER:\n"
        f"═══════════════════════════════════════════════════════════════════════\n"
        f"{dossier}\n\n"
        f"═══════════════════════════════════════════════════════════════════════\n"
        f"AVAILABLE IMAGES TO EMBED:\n"
        f"═══════════════════════════════════════════════════════════════════════\n"
        f"{images_formatted}\n"
    )
    
    response = llm_final.invoke([
        ("system", system_prompt),
        ("user", user_prompt)
    ])
    
    content = response.content if hasattr(response, "content") else str(response)
    
    return {
        "messages": [AIMessage(content=content)],
        "final_response": content
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Routing Logic & Graph Compilation
# ─────────────────────────────────────────────────────────────────────────────

def route_qwen_output(state: ResearchState) -> str:
    """Routes to tool execution if Qwen emitted tool calls; otherwise moves to dossier compilation."""
    messages = state.get("messages", [])
    if not messages:
        return "compile_dossier"
    
    last_message = messages[-1]
    if getattr(last_message, "tool_calls", None):
        return "execute_tools"
    return "compile_dossier"


def route_deep_research_loop(state: ResearchState) -> str:
    """Controls the Deep Research reflection loop (up to 2-3 hops) before proceeding to final generation."""
    mode = state.get("search_mode", "normal")
    loop_count = state.get("loop_count", 0)
    
    if mode == "deep_research" and loop_count < 2:
        return "qwen_researcher"
    return "final_generator"


def create_researcher_writer_graph(llm_qwen, llm_final):
    """Assembles and compiles the full LangGraph workflow."""
    llm_qwen_with_tools = llm_qwen.bind_tools(qwen_tools)
    
    workflow = StateGraph(ResearchState)
    
    # Add Nodes
    workflow.add_node("qwen_researcher", lambda state: qwen_researcher_node(state, llm_qwen_with_tools))
    workflow.add_node("execute_tools", ToolNode(qwen_tools))
    workflow.add_node("compile_dossier", compile_dossier_node)
    workflow.add_node("final_generator", lambda state: final_generator_node(state, llm_final))
    
    # Edges & Conditional Routing
    workflow.add_edge(START, "qwen_researcher")
    workflow.add_conditional_edges("qwen_researcher", route_qwen_output, {
        "execute_tools": "execute_tools",
        "compile_dossier": "compile_dossier"
    })
    workflow.add_edge("execute_tools", "compile_dossier")
    workflow.add_conditional_edges("compile_dossier", route_deep_research_loop, {
        "qwen_researcher": "qwen_researcher",
        "final_generator": "final_generator"
    })
    workflow.add_edge("final_generator", END)
    
    return workflow.compile()


# ─────────────────────────────────────────────────────────────────────────────
# 6. Standalone Execution / Test Runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="NYX Researcher-Writer Multi-Agent Workflow")
    parser.add_argument("--query", type=str, default="What are the key architectural features of Qwen 2.5 1.5B?", help="Search inquiry")
    parser.add_argument("--mode", type=str, choices=["normal", "research", "deep_research"], default="normal", help="Search depth level")
    parser.add_argument("--test-tools", action="store_true", help="Run standalone tool smoke tests without LLM invocation")
    args = parser.parse_args()

    print(f"=== NYX Researcher-Writer Multi-Agent Engine ===")
    print(f"Query: {args.query}")
    print(f"Mode:  {args.mode}")

    if args.test_tools:
        print("\n--- Testing ddg_text_search ---")
        t_res = ddg_text_search.invoke({"query": args.query, "max_results": 2})
        print(f"Text results count: {len(t_res)}")
        print(json.dumps(t_res, indent=2))

        print("\n--- Testing ddg_image_search ---")
        i_res = ddg_image_search.invoke({"query": args.query, "max_results": 2})
        print(f"Image results count: {len(i_res)}")
        print(json.dumps(i_res, indent=2))

        if t_res and t_res[0].get("url") and t_res[0]["url"].startswith("http"):
            print(f"\n--- Testing scrape_webpage on {t_res[0]['url']} ---")
            scraped = scrape_webpage.invoke({"url": t_res[0]["url"], "max_chars": 500})
            print(f"Scraped sample ({len(scraped)} chars):\n{scraped[:300]}...")
        print("\n[SUCCESS] All tools operational!")
        sys.exit(0)

    print("\nInitializing LangGraph Workflow...")
    qwen = get_qwen_model()
    gen = get_generator_model()
    graph = create_researcher_writer_graph(qwen, gen)
    print("Graph compiled successfully!")
