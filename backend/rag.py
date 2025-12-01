from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
import logging

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)

document_cache: Dict[str, FAISS] = {}
current_document_id: Optional[str] = None
_embeddings: Optional[HuggingFaceEmbeddings] = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading sentence-transformers/all-MiniLM-L6-v2 embeddings")
        _embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
    return _embeddings


def load_pdf_chunks(file_path: str) -> List[Document]:
    path = Path(file_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    loader = PyPDFLoader(str(path))
    pages = loader.load()
    docs = splitter.split_documents(pages)
    logger.info("Loaded %d PDF chunks from %s", len(docs), path)
    return docs


def load_txt_chunks(file_path: str) -> List[Document]:
    path = Path(file_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Text file not found: {path}")

    text = path.read_text(encoding="utf-8", errors="ignore")
    if not text.strip():
        raise ValueError(f"Text file is empty: {path}")

    docs = splitter.create_documents([text], metadatas=[{"source": str(path)}])
    logger.info("Loaded %d text chunks from %s", len(docs), path)
    return docs


def load_plain_text_chunks(raw_text: str, *, source: str = "inline-text") -> List[Document]:
    if not raw_text or not raw_text.strip():
        raise ValueError("Plain text input is empty")
    docs = splitter.create_documents([raw_text], metadatas=[{"source": source}])
    logger.info("Loaded %d chunks from inline text", len(docs))
    return docs


def build_vectorstore_from_docs(docs: List[Document]) -> FAISS:
    if not docs:
        raise ValueError("No documents were provided for indexing")
    embeddings = _get_embeddings()
    vectorstore = FAISS.from_documents(docs, embeddings)
    logger.info("Vectorstore built with %d chunks", len(docs))
    return vectorstore


def store_vectorstore(vectorstore: FAISS) -> str:
    global document_cache, current_document_id
    document_cache.clear()
    doc_id = str(uuid4())
    document_cache[doc_id] = vectorstore
    current_document_id = doc_id
    logger.info("Stored vectorstore under id %s", doc_id)
    return doc_id


def index_pdf_document(file_path: str) -> str:
    docs = load_pdf_chunks(file_path)
    vectorstore = build_vectorstore_from_docs(docs)
    return store_vectorstore(vectorstore)


def index_text_file(file_path: str) -> str:
    docs = load_txt_chunks(file_path)
    vectorstore = build_vectorstore_from_docs(docs)
    return store_vectorstore(vectorstore)


def index_plain_text(raw_text: str) -> str:
    docs = load_plain_text_chunks(raw_text)
    vectorstore = build_vectorstore_from_docs(docs)
    return store_vectorstore(vectorstore)


def get_vectorstore(document_id: Optional[str] = None) -> FAISS:
    target_id = document_id or current_document_id
    if not target_id:
        raise ValueError("No document has been indexed yet")
    try:
        return document_cache[target_id]
    except KeyError as exc:
        raise ValueError(f"Unknown document_id: {target_id}") from exc


def ask_question(question: str, *, document_id: Optional[str] = None, k: int = 4) -> tuple[str, list[str]]:
    vectorstore = get_vectorstore(document_id)
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )

    docs = retriever.invoke(question)
    context = "\n".join(doc.page_content for doc in docs)

    prompt = PromptTemplate(
        template=(
            "You are a helpful assistant answering questions based on the context below.\n"
            "Context: {context}\n"
            "Question: {question}\n"
            "Answer concisely. If the context lacks the answer, reply with \"I don't know\"."
        ),
        input_variables=["context", "question"],
    )

    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash-lite", temperature=0.5)
    final_prompt = prompt.format(context=context, question=question)
    response = llm.invoke(final_prompt)

    answer = getattr(response, "text", None) or getattr(response, "content", str(response))
    sources = [getattr(doc, "metadata", {}).get("source", "") for doc in docs]

    return answer, sources

