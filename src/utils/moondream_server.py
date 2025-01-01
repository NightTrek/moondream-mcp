#!/usr/bin/env python3
import argparse
import base64
import io
import json
import re
from threading import Thread
from typing import Iterator

import torch
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from transformers import AutoTokenizer, TextIteratorStreamer

from moondream.hf import LATEST_REVISION, Moondream, detect_device

app = FastAPI()

import os

# Initialize model
device, dtype = detect_device()
# Get model path from PYTHONPATH
pythonpath = os.environ.get('PYTHONPATH', '')
if not pythonpath:
    raise RuntimeError("PYTHONPATH environment variable not set")

# Split PYTHONPATH using platform-specific separator
path_sep = ';' if os.name == 'nt' else ':'
paths = pythonpath.split(path_sep)
if len(paths) < 2:
    raise RuntimeError(f"PYTHONPATH should contain both current directory and models directory. Got: {pythonpath}")

# Print debug info about paths
print(f"[Debug] Paths from PYTHONPATH:")
for i, path in enumerate(paths):
    print(f"  {i}: {path}")

model_path = os.path.join(paths[1], 'moondream-2b-int8.mf.gz')
if not os.path.exists(model_path):
    raise RuntimeError(f"Model file not found at {model_path}")

print(f"[Debug] Loading model from: {model_path}")

try:
    tokenizer = AutoTokenizer.from_pretrained("vikhyatk/moondream2", revision=LATEST_REVISION)
    moondream = Moondream.from_pretrained(
        model_path,
        torch_dtype=dtype,
        local_files_only=True
    ).to(device=device)
except Exception as e:
    print(f"[Error] Failed to load model: {e}")
    raise
moondream.eval()

def process_base64_image(image_url: str) -> Image.Image:
    # Extract base64 data after the comma
    base64_data = image_url.split(',')[1]
    image_data = base64.b64decode(base64_data)
    return Image.open(io.BytesIO(image_data))

def stream_response(image_embeds, question: str) -> Iterator[str]:
    streamer = TextIteratorStreamer(tokenizer, skip_special_tokens=True)
    thread = Thread(
        target=moondream.answer_question,
        kwargs={
            "image_embeds": image_embeds,
            "question": question,
            "tokenizer": tokenizer,
            "streamer": streamer,
        }
    )
    thread.start()

    for text in streamer:
        # Wrap each chunk in a JSON object for the MCP server
        yield json.dumps({"chunk": text}) + "\n"

@app.post("/query/stream")
async def query_stream(request: Request):
    data = await request.json()
    image = process_base64_image(data["image_url"])
    question = data["question"]
    
    # Get image embeddings
    image_embeds = moondream.encode_image(image)
    
    return StreamingResponse(
        stream_response(image_embeds, question),
        media_type="application/x-ndjson"
    )

@app.post("/caption/stream")
async def caption_stream(request: Request):
    data = await request.json()
    image = process_base64_image(data["image_url"])
    
    # Get image embeddings and use a generic caption prompt
    image_embeds = moondream.encode_image(image)
    return StreamingResponse(
        stream_response(image_embeds, "Generate a detailed caption for this image."),
        media_type="application/x-ndjson"
    )

# Keep the original endpoints for compatibility
@app.post("/query")
async def query(request: Request):
    data = await request.json()
    image = process_base64_image(data["image_url"])
    question = data["question"]
    
    image_embeds = moondream.encode_image(image)
    answer = moondream.answer_question(
        image_embeds=image_embeds,
        question=question,
        tokenizer=tokenizer
    )
    
    return {"answer": answer}

@app.post("/caption")
async def caption(request: Request):
    data = await request.json()
    image = process_base64_image(data["image_url"])
    
    image_embeds = moondream.encode_image(image)
    caption = moondream.answer_question(
        image_embeds=image_embeds,
        question="Generate a detailed caption for this image.",
        tokenizer=tokenizer
    )
    
    return {"caption": caption}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=3475)
