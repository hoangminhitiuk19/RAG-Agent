import streamlit as st
import openai
import os
import json
import faiss
import numpy as np
import requests
from dotenv import load_dotenv
from supabase_config import supabase  # Import global Supabase client
from PIL import Image
import io
import base64
from io import BytesIO


# Load environment variables
load_dotenv()

# Retrieve credentials from .env
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"
FAISS_INDEX_FILE = "faiss_index.bin"
PROCESSED_FILE = "processed_chunks.json"
METADATA_FILE = "faiss_metadata.json"


# OpenAI Assistant ID for disease detection
ASSISTANT_ID = "asst_EB0lfLqWCH5dDBLSLsMCbTCt"

# Set OpenAI API key
openai.api_key = OPENAI_API_KEY

# ✅ Function to Convert Image to Base64
def load_base64_icon(image_path):
    """Reads an image and encodes it to base64 for HTML embedding."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

def image_to_base64(image):
    """Convert an image file to a base64-encoded string for embedding in HTML."""
    image_bytes = BytesIO(image.getvalue())  # Convert image to bytes
    encoded = base64.b64encode(image_bytes.read()).decode("utf-8")  # Encode to Base64
    return encoded

# ✅ Load avatar images
user_avatar_base64 = load_base64_icon("static/user_icon.png")
ai_avatar_base64 = load_base64_icon("static/ai_icon.png")
# ✅ Load Custom Styles from static/styles.css
def load_css():
    import os
    css_path = "static/styles.css"
    
    if os.path.exists(css_path):
        with open(css_path, "r") as f:
            st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)
    else:
        st.warning("⚠️ styles.css not found in static/ folder!")

# ✅ Fetch user data (User Name & Farms)
def fetch_user_data(user_id):
    """Retrieve user name from the farmer table and farms from Supabase."""
    try:
        # ✅ Get user_profile_id from user_id
        user_profile_response = supabase.table("user_profile").select("user_profile_id").eq("user_id_fk", user_id).execute()
        if not user_profile_response.data:
            return "User", []
        user_profile_id = user_profile_response.data[0]["user_profile_id"]

        # ✅ Get first_name from farmer table using user_profile_id
        farmer_response = supabase.table("farmer").select("first_name, farmer_id").eq("user_profile_id_fk", user_profile_id).execute()
        if not farmer_response.data:
            return "User", []
        user_name = farmer_response.data[0]["first_name"]
        farmer_id = farmer_response.data[0]["farmer_id"]

        # ✅ Get farms using farmer_id
        farms_response = supabase.table("farm").select("farm_id, city").eq("farmer_id_fk", farmer_id).execute()
        farms = farms_response.data if farms_response.data else []

        return user_name, farms
    except Exception as e:
        print("DEBUG: Error fetching user data:", e)
        return "User", []
    
def get_weather(city):
    """Fetches weather data for a given city using OpenWeatherMap API."""
    if not city:
        return None

    params = {
        "q": city,
        "appid": WEATHER_API_KEY,
        "units": "metric"
    }
    response = requests.get(WEATHER_API_URL, params=params)

    if response.status_code == 200:
        data = response.json()
        return {
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "condition": data["weather"][0]["description"]
        }
    else:
        return None  # Handle error gracefully


def load_faiss_index():
    """Loads the FAISS index from the saved file."""
    return faiss.read_index(FAISS_INDEX_FILE)


def get_embedding(text):
    """Generates an embedding for a given query using OpenAI."""
    response = openai.embeddings.create(
        model="text-embedding-ada-002",
        input=text
    )
    return np.array(response.data[0].embedding, dtype=np.float32)


def search_faiss(query, index, top_k=3):
    """Searches FAISS index for the most relevant chunks."""
    query_embedding = get_embedding(query)
    query_embedding = np.expand_dims(query_embedding, axis=0)  # Reshape for FAISS
    distances, indices = index.search(query_embedding, top_k)
    return indices[0], distances[0]

def load_chunks():
    """Loads text chunks and metadata from JSON files."""
    try:
        with open(PROCESSED_FILE, "r", encoding="utf-8") as file:
            chunks = json.load(file)

        with open(METADATA_FILE, "r", encoding="utf-8") as meta_file:
            metadata_mapping = json.load(meta_file)

        return chunks, metadata_mapping  # Returns both text chunks and metadata
    except Exception as e:
        return [], {}


def query_rag_system(user_query, city):
    """Queries FAISS, retrieves relevant text, and generates a response with GPT-4."""
    index = load_faiss_index()
    chunks, metadata_mapping = load_chunks()

    # Get weather data
    weather_info = get_weather(city)
    if not weather_info:
        return None, "⚠ Could not retrieve weather data. Please check the city name."

    indices, distances = search_faiss(user_query, index, top_k=3)

    retrieved_chunks = [chunks[idx]["text"] for idx in indices]
    retrieved_metadata = [metadata_mapping[str(idx)] for idx in indices]  # Fix: Ensure correct metadata retrieval

    ai_response = generate_rag_response(user_query, retrieved_chunks, retrieved_metadata, weather_info)

    return retrieved_chunks, retrieved_metadata, ai_response

def generate_rag_response():
    """Generates a structured AI response using retrieved knowledge, weather, and diagnosis."""
    
    # ✅ Retrieve last AI diagnosis (Ensure it's available)
    disease_diagnosis = st.session_state.get("last_ai_response", "⚠ No AI diagnosis found!")

    # ✅ Retrieve farm location for weather data
    farm_location = st.session_state.get("farm_location", None)

    # ✅ Fetch Weather Data (if location exists)
    weather_info = get_weather(farm_location) if farm_location else None
    weather_section = (
        f"🌍 **Weather Conditions for {weather_info['city']}, {weather_info['country']}**:\n"
        f"- Temperature: {weather_info['temperature']}°C\n"
        f"- Humidity: {weather_info['humidity']}%\n"
        f"- Condition: {weather_info['condition']}"
        if weather_info else "⚠ Weather data unavailable."
    )
    print(weather_section)
    # ✅ Retrieve FAISS Knowledge
    index = load_faiss_index()
    chunks, metadata_mapping = load_chunks()
    indices, distances = search_faiss(disease_diagnosis, index, top_k=3)

    retrieved_chunks = [chunks[idx]["text"] for idx in indices]
    retrieved_metadata = [metadata_mapping[str(idx)] for idx in indices]

    # ✅ Prepare Knowledge Section with Sources
    knowledge_section = "\n".join(
        [f"📌 **Source {i+1}:** {metadata['filename']} ({metadata['file_type']})\n{chunk}"
        for i, (chunk, metadata) in enumerate(zip(retrieved_chunks, retrieved_metadata))]
    )

    # ✅ Generate Structured AI Response using GPT-4
    rag_prompt = f"""
        You are an expert in coffee farming and regenerative agriculture.
        A farmer has uploaded an image of a coffee plant, and the AI diagnosed it as **{disease_diagnosis}**.

        ## 🌍 Farm Location & Weather Conditions
        The farm location is **{farm_location if farm_location else "unknown"}**.
        {weather_section}  # ✅ Now correctly inserted

        **⚠️ Consider how the above weather conditions impact the disease, crop health, and recommended treatments.**

        ## 📖 Retrieved Knowledge from Research Documents
        {knowledge_section}

        ## ✅ Your Task:
        Summarize and provide a structured response, integrating both retrieved knowledge and weather data.

        ### 1️⃣ **Diagnosis Explanation**
        - Explain what the disease is and why it occurs.
        - Discuss how the current weather conditions may **increase or decrease** its spread.

        ### 2️⃣ **Impact on the Farm**
        - How will this affect the farmer’s crops in both **short-term and long-term**?
        - Consider the **weather conditions** and their influence.

        ### 3️⃣ **Treatment & Prevention**
        - Suggest regenerative farming methods to handle this issue.
        - How should the farmer adapt **given the current weather conditions**?

        ### 4️⃣ **Advice for the Farmer**
        - Provide **clear, actionable** steps.
        - Consider **future weather trends** in the region.

        **📝 Your response should be professional, structured, and practical for a small-scale farmer.**
        """

    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "system", "content": "You are an expert in coffee farming and regenerative agriculture."},
                  {"role": "user", "content": rag_prompt}]
    )

    structured_ai_response = response.choices[0].message.content

    # ✅ Store final response in session state (For follow-up conversations)
    st.session_state["conversation_context"] = structured_ai_response

    return structured_ai_response  # ✅ Return structured AI answer


# ✅ Main Chat UI
def chat_ui():
    st.title("RegenX Chatbot 🌱")

    # ✅ Load Custom Styles
    load_css()

    # ✅ Ensure session state variables
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "selected_farm" not in st.session_state:
        st.session_state.selected_farm = None
    if "farm_data" not in st.session_state:
        st.session_state.farm_data = []
    if "user_name" not in st.session_state:
        st.session_state.user_name = "User"
    if "image_processing_done" not in st.session_state:
        st.session_state.image_processing_done = False
    if "last_uploaded_image" not in st.session_state:
        st.session_state.last_uploaded_image = None
    if "image_analyzed" not in st.session_state:
        st.session_state.image_analyzed = False
    if "last_ai_response" not in st.session_state:
        st.session_state.last_ai_response = None
    if "farm_question_asked" not in st.session_state:
        st.session_state.farm_question_asked = False
    if "farm_location" not in st.session_state:
        st.session_state.farm_location = None

    user_id = st.session_state.get("user_id")
    if user_id:
        user_name, farms = fetch_user_data(user_id)
        st.session_state.user_name = user_name
        st.session_state.farm_data = farms
    # ✅ Display chat history
    chat_placeholder = st.container()
    with chat_placeholder:
        for message in st.session_state.chat_history:
            row_class = "row-reverse" if message["role"] == "user" else ""
            chat_bubble_class = "human-bubble" if message["role"] == "user" else "ai-bubble"
            avatar_base64 = user_avatar_base64 if message["role"] == "user" else ai_avatar_base64
            
            # ✅ Correctly handle images and text
            if message["type"] == "image":
                message_content = f'<img src="data:image/png;base64,{message["content"]}" width="150">'
            else:
                message_content = message["content"]

            div = f"""
            <div class="chat-row {row_class}">
                <img class="chat-icon" src="data:image/png;base64,{avatar_base64}" width="32" height="32">
                <div class="chat-bubble {chat_bubble_class}">
                    {message_content}
                </div>
            </div>
            """
            st.markdown(div, unsafe_allow_html=True)

    # ✅ Handle new text input
    # ✅ Handle new text input
    user_input = st.chat_input("Ask FarmAI...")

    if user_input:
        # ✅ Store user input in chat history before AI response
        st.session_state.chat_history.append({
            "role": "user",
            "type": "text",
            "content": user_input
        })

        # ✅ Retrieve past conversation context for follow-up response
        previous_context = "\n".join([
            msg["content"] for msg in st.session_state.chat_history if msg["role"] == "assistant"
        ][-3:])

        # ✅ Build prompt for AI with context
        followup_prompt = f"""
        You are an expert in coffee farming and regenerative agriculture. 
        A user has already received a diagnosis and insights about a disease affecting their crops.
        
        **User Information:**
        - User: {st.session_state.user_name}
        **Previous AI Response:** 
        {previous_context}
        
        **User Follow-up Question:** 
        {user_input}
        
        Provide a relevant and helpful response based on the diagnosis and regenerative knowledge.
        """

        # ✅ Send Follow-up Query to GPT-4
        followup_response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert in coffee farming and regenerative agriculture."},
                {"role": "user", "content": followup_prompt}
            ]
        ).choices[0].message.content

        # ✅ Store AI response in chat history
        st.session_state.chat_history.append({
            "role": "assistant",
            "type": "text",
            "content": followup_response
        })

        # ✅ Refresh UI to display messages properly
        st.rerun()

    # ✅ File uploader for image-based diagnosis
    uploaded_image = st.file_uploader("📷 Upload an image...", type=["jpg", "png", "jpeg"])

    if uploaded_image and uploaded_image != st.session_state.last_uploaded_image and not st.session_state.image_analyzed:
        # ✅ Mark image as processed
        st.session_state.image_analyzed = True
        st.session_state.image_processing_done = True
        st.session_state.last_uploaded_image = uploaded_image

        # ✅ Convert image to Base64 before storing it in chat history
        image_base64 = image_to_base64(uploaded_image)
        st.session_state.chat_history.append({"role": "user", "type": "image", "content": image_base64})

        # ✅ Display uploaded image
        with st.chat_message("user"):
            st.image(uploaded_image, width=100)

        # ✅ Step 1: Process image with OpenAI Assistant (Disease Detection)
        with st.chat_message("assistant"):
            with st.spinner("🧐 Analyzing image... Please wait."):
                disease_diagnosis = analyze_image_with_openai(uploaded_image)  # ✅ Get disease diagnosis
        
        # ✅ Show only the diagnosis (RAG will be triggered later)
        st.session_state["last_ai_response"] = disease_diagnosis  # ✅ Store AI diagnosis

        with st.chat_message("assistant"):
            st.markdown(f"💡 **Diagnosis:** {disease_diagnosis}")  # ✅ Display diagnosis only

        # ✅ Store AI diagnosis in chat history
        st.session_state.chat_history.append({"role": "assistant", "type": "text", "content": f"💡 **Diagnosis:** {disease_diagnosis}"})

        

        # ✅ Set flag to prompt farm selection before generating RAG
        st.session_state.farm_question_asked = False  # ✅ Reset question flag

        # ✅ Refresh UI to prompt user for farm selection
        st.rerun()


    # ✅ Ask User About Farm Location After Diagnosis (Only Once)
    if st.session_state.image_processing_done and not st.session_state.selected_farm and not st.session_state.farm_question_asked:
        farm_question = f"Hi {st.session_state.user_name}, did this happen on one of your farms or is this just a random question?"
        st.session_state.chat_history.append({"role": "assistant", "type": "text", "content": farm_question})
        st.session_state.farm_question_asked = True  # ✅ Prevent duplicate farm questions
        st.rerun()

    # ✅ Store Farm Selection and Proceed to RAG
    if st.session_state.farm_question_asked and st.session_state.selected_farm is None and "rag_response" not in st.session_state:

        st.markdown("### 🌱 Choose a farm:")

        for farm in st.session_state.farm_data:
            if st.button(f"🏡 Farm {farm['city']}", key=farm["farm_id"]):
                st.session_state.selected_farm = farm  
                st.session_state.farm_location = f"{farm['city']}"  # ✅ Store farm location  
                st.session_state.chat_history.append({
                    "role": "user",
                    "type": "text",
                    "content": f"I chose Farm {farm['city']} 🌾"
                })


                st.rerun()

        # ✅ Random Question Option
        if st.button("❓ Random Question"):
            st.session_state.selected_farm = "random"
            st.session_state.farm_location = None  # ✅ No location for random questions
            st.session_state.chat_history.append({
                "role": "user",
                "type": "text",
                "content": "I chose Random Question ❓"
            })

            # ✅ Generate & Store RAG Response for Random Question
            final_rag_response = generate_rag_response()
            st.session_state.chat_history.append({
                "role": "assistant",
                "type": "text",
                "content": final_rag_response
            })

            st.rerun()


    # ✅ After farm selection, generate RAG response
    if st.session_state.selected_farm and st.session_state.last_ai_response:
    # ✅ Generate RAG response only if not already stored
        if "rag_response" not in st.session_state:
            with st.chat_message("assistant"):
                with st.spinner("🔍 Fetching regenerative insights..."):
                    st.session_state["rag_response"] = generate_rag_response()  # ✅ Store before rerun!
                    st.markdown(st.session_state["rag_response"])

        # ✅ Store response in chat history if not already there
        if not any(msg["content"] == st.session_state["rag_response"] for msg in st.session_state.chat_history):
            st.session_state.chat_history.append({
                "role": "assistant",
                "type": "text",
                "content": st.session_state["rag_response"]
            })

        # ✅ Reset farm selection after storing RAG response
        st.session_state.selected_farm = None  
        st.rerun()






# Function to send message and process response

def send_message(user_prompt, selected_image):
    """Handles sending messages and updates chat history immediately."""
    
    if user_prompt.strip():
        st.session_state.chat_history.append({"role": "user", "type": "text", "content": user_prompt})

    if selected_image:
        st.session_state.chat_history.append({"role": "user", "type": "image", "content": selected_image})

        with st.spinner("🧐 Analyzing image... Please wait."):
            analysis_result = analyze_image_with_openai(selected_image)
        st.session_state.chat_history.append({"role": "assistant", "type": "text", "content": f"💡 **AI Diagnosis:** {analysis_result}"})

    # ✅ Force Streamlit to rerun, so messages appear immediately
    st.rerun()



def analyze_image_with_openai(uploaded_image):
    """Sends an uploaded image to OpenAI Assistant for disease detection and returns AI response."""
    try:
        # ✅ Read the uploaded image as bytes
        image_bytes = uploaded_image.getvalue()

        # ✅ Upload image to OpenAI storage (for vision analysis)
        uploaded_file = openai.files.create(
            file=("coffee_leaf.png", io.BytesIO(image_bytes), "image/png"),  # ✅ Convert to proper format
            purpose="vision"
        )

        # ✅ Create a new thread for conversation
        thread = openai.beta.threads.create()

        # ✅ Create a message with the uploaded image
        message = openai.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=[
                {"type": "text", "text": "Analyze this image for coffee plant diseases."},
                {"type": "image_file", "image_file": {"file_id": uploaded_file.id, "detail": "auto"}}
            ]
        )

        # ✅ Run the Assistant on the thread
        run = openai.beta.threads.runs.create(
            thread_id=thread.id,
            assistant_id=ASSISTANT_ID
        )

        # ✅ Wait for Assistant to finish processing
        while run.status in ["queued", "in_progress"]:
            run = openai.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)

        # ✅ Retrieve messages from the assistant
        messages = openai.beta.threads.messages.list(thread_id=thread.id)

        # ✅ Ensure response is received
        if not messages.data:
            return "**⚠ No response received from AI.**"

        # ✅ Extract AI response in Markdown format
        response_text = messages.data[0].content[0].text.value  # Extract text response

        # ✅ Store AI diagnosis in session state to use later in RAG
        st.session_state.last_ai_response = response_text  # ✅ Ensures it's available after farm selection

        return response_text  # ✅ Direct Markdown response

    except Exception as e:
        return f"⚠ **Error analyzing image:** {str(e)}"

