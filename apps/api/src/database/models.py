from sqlalchemy import Column, String, Integer, Text, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from .config import Base

def generate_uuid():
    return str(uuid.uuid4())

class Session(Base):
    __tablename__ = 'sessions'

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = 'messages'

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey('sessions.id'), nullable=False)
    role = Column(String, nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=True)
    tool_call_id = Column(String, nullable=True)
    name = Column(String, nullable=True) # For tool calls
    tool_calls = Column(Text, nullable=True) # JSON string of tool calls made
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="messages")

class Memory(Base):
    __tablename__ = 'memories'

    id = Column(String, primary_key=True, default=generate_uuid)
    fact = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
