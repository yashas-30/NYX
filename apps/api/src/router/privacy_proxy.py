from gliner import GLiNER
import re
import uuid

# Load the fast GLiNER model for Named Entity Recognition
# Using a small, fast model suitable for local processing
gliner_model = GLiNER.from_pretrained("urchade/gliner_small-v2.1")

# Define the entity labels we want to intercept and mask
SENSITIVE_LABELS = ["person", "email", "phone number", "credit card", "api key", "password"]

class PrivacyProxy:
    def __init__(self):
        # In-memory store for rehydration
        # Maps placeholder token -> original value
        self.session_store = {}
    
    def mask_prompt(self, prompt: str) -> tuple[str, dict]:
        """
        Intercepts the prompt, masks sensitive data, and returns
        the masked prompt along with the session map for rehydration.
        """
        masked_prompt = prompt
        session_map = {}
        
        # 1. Use GLiNER for contextual Named Entity Recognition
        entities = gliner_model.predict_entities(prompt, SENSITIVE_LABELS)
        
        # Sort entities by start position in reverse order to avoid offset shifting during replacement
        entities = sorted(entities, key=lambda x: x["start"], reverse=True)
        
        for idx, entity in enumerate(entities):
            original_text = entity["text"]
            label = entity["label"].upper().replace(" ", "_")
            placeholder = f"[MASKED_{label}_{idx}]"
            
            # Store in session map
            session_map[placeholder] = original_text
            self.session_store[placeholder] = original_text
            
            # Replace in prompt
            # We use string slicing because replace() might replace unintended occurrences
            start, end = entity["start"], entity["end"]
            masked_prompt = masked_prompt[:start] + placeholder + masked_prompt[end:]
            
        # 2. Use Deterministic Regex for high-confidence patterns (fallback)
        # Email Regex
        email_pattern = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
        for match in email_pattern.finditer(masked_prompt):
            original_text = match.group(0)
            placeholder = f"[MASKED_EMAIL_REGEX_{uuid.uuid4().hex[:8]}]"
            session_map[placeholder] = original_text
            self.session_store[placeholder] = original_text
            masked_prompt = masked_prompt.replace(original_text, placeholder)
            
        return masked_prompt, session_map

    def rehydrate_response(self, response: str, session_map: dict = None) -> str:
        """
        Takes the response from the Cloud LLM and maps placeholders
        back to their original sensitive values.
        """
        map_to_use = session_map if session_map is not None else self.session_store
        
        rehydrated_response = response
        for placeholder, original_text in map_to_use.items():
            rehydrated_response = rehydrated_response.replace(placeholder, original_text)
            
        return rehydrated_response

# Singleton instance
privacy_proxy = PrivacyProxy()
