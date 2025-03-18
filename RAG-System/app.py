import os
import time
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid
from typing import Optional

app = FastAPI()

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your web client URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_endpoint(
    request: Request,
    message: str = Form(...),
    session_id: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None)
):
    """Handle both initial diagnosis requests and follow-up questions."""
    # Create session if none exists
    if not session_id:
        session_id = str(uuid.uuid4())
        
    try:
        # Process request with image URL if provided (first interaction)
        if image_url:
            # Handle image-based diagnosis
            response = f"Analyzing image: {image_url}\n\nThis is a placeholder response for image analysis."
            
            return JSONResponse({
                "session_id": session_id,
                "response": response,
                "has_diagnosis": True
            })
        else:
            # Handle text-only follow-up
            response = f"You said: {message}\n\nThis is a placeholder response for follow-up questions."
            
            return JSONResponse({
                "session_id": session_id,
                "response": response
            })
    
    except Exception as e:
        import traceback
        print(f"Error processing request: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "timestamp": time.time()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)