import os
import tempfile
from typing import Optional, Annotated, Any
 
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .rag import (
    ask_question,
    index_pdf_document,
    index_plain_text,
    index_text_file,
)

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

class UploadResponse(BaseModel):
    document_id: str


class ChatRequest(BaseModel):
    question: str
    document_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


UploadField = Annotated[Any, File()]
PlainTextField = Annotated[str | None, Form()]

def _coerce_upload(value: Any) -> UploadFile | None:
    if value is None:
        return None
    if isinstance(value, UploadFile):
        return value
    if hasattr(value, "filename") and hasattr(value, "file"):
        return value  # Covers Starlette UploadFile instances
    return None

@app.post("/upload", response_model=UploadResponse)
async def upload_document(
    pdf_file: UploadField = None,
    txt_file: UploadField = None,
    plain_text: PlainTextField = None,
) -> UploadResponse:
    pdf_upload = _coerce_upload(pdf_file)
    txt_upload = _coerce_upload(txt_file)
    plain_text_value = plain_text.strip() if plain_text else None

    sources_provided = sum(
        bool(option)
        for option in (
            pdf_upload,
            txt_upload,
            plain_text_value,
        )
    )
    if sources_provided != 1:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of pdf_file, txt_file, or plain_text.",
        )

    temp_path = None
    try:
        if pdf_upload:
            temp_fd, temp_path = tempfile.mkstemp(suffix=".pdf")
            with os.fdopen(temp_fd, "wb") as tmp:
                tmp.write(await pdf_upload.read())
            document_id = index_pdf_document(temp_path)
        elif txt_upload:
            temp_fd, temp_path = tempfile.mkstemp(suffix=".txt")
            with os.fdopen(temp_fd, "wb") as tmp:
                tmp.write(await txt_upload.read())
            document_id = index_text_file(temp_path)
        else:
            assert plain_text_value is not None
            document_id = index_plain_text(plain_text_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

    return UploadResponse(document_id=document_id)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        answer, sources = ask_question(
            request.question,
            document_id=request.document_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return ChatResponse(answer=answer, sources=sources)

