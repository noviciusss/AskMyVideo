import os 
from dotenv import load_dotenv

load_dotenv()

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from typing import Dict
import logging

logger = logging.getLogger(__name__)

def extract_video_id(youtube_url: str) -> str:
    """Extract the video ID from a YouTube URL."""
    if "youtube.com/watch?v=" in youtube_url:
        return youtube_url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in youtube_url:
        return youtube_url.split("youtu.be/")[1].split("?")[0]
    else:
        raise ValueError("Invalid YouTube URL")

def get_transcript(youtube_url:str)->str:
    """Get the transcript of youTube video from url."""
    video_id = extract_video_id(youtube_url)
    try:
        transcipt_list = YouTubeTranscriptApi().fetch(video_id)
    
        transcipt = " ".join(snippet.text for snippet in transcipt_list)
        return transcipt
    
    except TranscriptsDisabled as exc:
        logger.warning("No transcript available for this video.")
        raise ValueError("Transcript is not available for this video.") from exc
    except Exception as exc:
        logger.exception("Failed to fetch transcript for %s", youtube_url)
        raise RuntimeError("Unable to fetch transcript.") from exc
    
video_index_cache: Dict[str, FAISS] = {}     
def build_get_pipline(youtube_url: str, *, force_refresh: bool = False):
    """Build (or reuse) the RAG pipeline from a YouTube video URL."""
    if not force_refresh and youtube_url in video_index_cache:
        logger.info("Vectorstore cache hit for %s", youtube_url)
        return video_index_cache[youtube_url]
    transcript = get_transcript(youtube_url)
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=200)
    texts = splitter.create_documents([transcript])
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    vectorstore = FAISS.from_documents(texts, embeddings)
    video_index_cache[youtube_url] = vectorstore
    logger.info("Vectorstore built for %s (chunks=%d)", youtube_url, len(texts))
    return vectorstore
    
def prepare_video_context(youtube_url: str, *, force_refresh: bool = False) -> None:
    """Call this right after the frontend receives a URL so the index is warm for later Q&A."""
    build_get_pipline(youtube_url, force_refresh=force_refresh)
    logger.info("Video context ready for %s", youtube_url)

def ask_question(youtube_url:str,question:str)->tuple[str,list[str]]:
    vectorstore = build_get_pipline(youtube_url)
    retriver = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k":4})
    
    logger.info("Answering question for %s | cache_size=%d", youtube_url, len(video_index_cache))

    docs = retriver.invoke(question)
    context = "\n".join([doc.page_content for doc in docs])
    
    prompt = PromptTemplate(
        template ="""You are a helpful assistant answerning questions based on the context below.
        Context: {context}
        Question: {question}
        Answeer in a concise manner. and ans only based on the context provided. if the context does not contain the answer, say "I don't know".""",
        input_variables=["context","question"]
    )
    
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash-lite", temperature=0.5)
    
    final_prompt = prompt.format(context=context, question=question)
    response =llm.invoke(final_prompt)
    
    answer = getattr(response, "text", None) or getattr(response, "content", str(response))
    sources = [getattr(d, "metadata", {}).get("source", "") for d in docs]

    return answer, sources

