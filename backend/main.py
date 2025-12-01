import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .rag import ask_question, prepare_video_context

app = FastAPI()

raw_origins = os.getenv("ALLOWED_ORIGINS", "*").strip()
if raw_origins == "*":
    cors_origins = ["*"]
    cors_allow_credentials = False
else:
    cors_origins = [origin for origin in (item.strip() for item in raw_origins.split(",")) if origin]
    cors_allow_credentials = True
    if not cors_origins:
        raise RuntimeError("ALLOWED_ORIGINS must list at least one origin or be '*'")

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
    try:
        prepare_video_context(request.youtube_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "ready"}

@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    try:
        answer, sources = ask_question(request.youtube_url, request.question)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return AskResponse(answer=answer, sources=sources)

