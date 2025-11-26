import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag import ask_question, prepare_video_context

app = FastAPI()

raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
if raw_origins.strip() == "*":
    cors_origins = ["*"]
    cors_allow_credentials = False
else:
    cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    if "https://ask-my-video.vercel.app" not in cors_origins:
        cors_origins.append("https://ask-my-video.vercel.app")
    cors_allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    youtube_url: str
    question: str

class AskResponse(BaseModel):
    answer: str
    sources: list[str]


class PrepareRequest(BaseModel):
    youtube_url: str


@app.post("/prepare")
async def prepare(request: PrepareRequest) -> dict[str, str]:
    """Pre-build the vector index so later /ask calls are faster."""
    prepare_video_context(request.youtube_url)
    return {"status": "ready"}
    
@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    answer, sources = ask_question(request.youtube_url, request.question)
    return AskResponse(answer=answer, sources=sources)

