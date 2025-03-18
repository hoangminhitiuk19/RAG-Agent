import streamlit as st

def settings_ui():
    st.title("⚙️ **Settings**")
    model_choice = st.selectbox("Select AI Model", ["GPT-4", "Custom RAG Model"])
    st.write(f"Selected Model: {model_choice}")
    st.checkbox("Enable Advanced AI Suggestions")
