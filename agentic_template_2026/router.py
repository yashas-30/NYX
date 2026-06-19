import os
from pydantic import BaseModel, Field
from langchain_core.language_models import BaseChatModel
from langchain_community.chat_models import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

class CritiqueSchema(BaseModel):
    """2026 Standard: Structured Output for the Critic."""
    score: int = Field(description="Score from 1 to 10 on the quality and accuracy of the response.")
    is_passing: bool = Field(description="True if the response is excellent and ready for the user. False if it needs revision.")
    flaws: list[str] = Field(description="List of specific flaws, hallucinations, or missing information.")
    feedback: str = Field(description="Constructive feedback for the generator to improve the response.")

class HybridModelRouter:
    """
    2026 Standard: Intelligent Hybrid Inference Routing.
    """
    def __init__(self):
        self.cloud_provider = os.getenv("CLOUD_PROVIDER", "google").lower()
        
    def get_router_model(self) -> BaseChatModel:
        """Fast local model for parsing intent."""
        try:
            return ChatOllama(model="llama3", temperature=0)
        except Exception as e:
            print(f"[Warning] Local model not available. Fallback to cloud. {e}")
            return self.get_reasoning_model()

    def get_reasoning_model(self, task_complexity: str = "high") -> BaseChatModel:
        """The cloud frontier model for deep reasoning and tool use."""
        if self.cloud_provider == "google":
            model = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash", 
                temperature=0.2,
                google_api_key=os.getenv("GEMINI_API_KEY", "mock_key")
            )
        elif self.cloud_provider == "openai":
            model = ChatOpenAI(
                model="gpt-4o", 
                temperature=0.2,
                api_key=os.getenv("OPENAI_API_KEY", "mock_key")
            )
        else:
            raise ValueError("Unsupported cloud provider specified.")
            
        # 2026 UX Standard: Progressive Disclosure & Generative UI
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an advanced 2026 AI Agent. 
            You MUST follow two core UI patterns:
            
            1. PROGRESSIVE DISCLOSURE:
            Before you provide your final answer, you MUST enclose your internal reasoning, tool strategy, and logic inside <think>...</think> tags.
            
            2. GENERATIVE UI (GenUI):
            If you are providing structured data like a list of files, a code snippet, or web search results, DO NOT just write it as raw text. Instead, emit a UI Component rendering tag in this exact format:
            [RENDER_COMPONENT: component_name]
            { "json": "data" }
            [/RENDER_COMPONENT]
            
            Supported components:
            - `directory_tree`: For displaying folder contents.
            - `search_results`: For displaying web search results.
            - `markdown_card`: For general structured text or code.
            """),
            MessagesPlaceholder(variable_name="messages")
        ])
        
        return prompt | model

    def get_critic_model(self):
        """
        Returns a cloud model bound to the CritiqueSchema.
        """
        base_model = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash", 
            temperature=0,
            google_api_key=os.getenv("GEMINI_API_KEY", "mock_key")
        ) if self.cloud_provider == "google" else ChatOpenAI(
            model="gpt-4o", 
            temperature=0,
            api_key=os.getenv("OPENAI_API_KEY", "mock_key")
        )
        return base_model.with_structured_output(CritiqueSchema)
