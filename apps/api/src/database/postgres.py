import psycopg
from psycopg_pool import ConnectionPool
from langgraph.checkpoint.postgres import PostgresSaver
from src.config.settings import settings

def get_postgres_saver():
    """
    Initializes and returns a PostgresSaver checkpointer for LangGraph.
    This provides durable Short-Term Memory for the Agentic workflows.
    """
    # In a real environment, read from settings.DATABASE_URL
    # Here we default to a local instance
    db_uri = getattr(settings, "DATABASE_URL", "postgresql://user:password@localhost:5432/nyx_db")
    
    # Establish a connection
    # Note: autocommit must be True for the checkpointer
    conn = psycopg.connect(db_uri, autocommit=True)
    
    # Create the checkpointer
    checkpointer = PostgresSaver(conn)
    
    try:
        # Call setup() to initialize the necessary LangGraph schema tables
        checkpointer.setup()
    except Exception as e:
        print(f"Postgres setup warning (may already exist): {e}")
        
    return checkpointer, conn
