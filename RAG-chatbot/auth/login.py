import streamlit as st
from supabase_config import supabase  # Import Supabase client
import time

def login_ui():
    st.title("🔐 Login to RegenX Chatbot")

    # Ensure session variables are initialized
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    if "user_id" not in st.session_state:
        st.session_state.user_id = None

    # If already logged in, redirect to main menu
    if st.session_state.authenticated and st.session_state.user_id:
        st.success("✅ Already logged in! Redirecting...")
        st.rerun()

    # Login Form
    email = st.text_input("📧 Email", label_visibility="collapsed")
    password = st.text_input("🔑 Password", type="password", label_visibility="collapsed")

    if st.button("Login"):
        with st.spinner("Authenticating..."):
            try:
                response = supabase.auth.sign_in_with_password({"email": email, "password": password})
                user = response.user

                if user:
                    st.session_state.authenticated = True
                    st.session_state.user_id = user.id  # Store user ID in session
                    st.session_state.selected = "Main Page"  # Default page after login
                    st.success("✅ Login successful! Redirecting...")
                    st.rerun()  # Ensures session state persists after rerun
                else:
                    st.error("Invalid email or password.")
            except Exception as e:
                st.error(f"Login failed: {str(e)}")
