import streamlit as st
# ✅ Ensure this is the first command
st.set_page_config(page_title="FarmAI", page_icon="💬", layout="wide")
from auth.login import login_ui  # Import login system
from views.main_page import main_page_ui
from views.chat import chat_ui
from views.user_profile import user_profile_ui
from views.settings import settings_ui




# Initialize authentication state if not already set
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False

# ✅ Show login page first, without sidebar
if not st.session_state.authenticated:
    login_ui()
    st.stop()  # Prevent rendering the rest of the app (including sidebar)



# ✅ Sidebar should only appear AFTER login
with st.sidebar:
    st.image("assets/company-logo-with-name.png", width=250)

    # Sidebar Menu
    if st.button("🏠 Main Page"):
        st.session_state.selected = "Main Page"
    if st.button("💬 Chat"):
        st.session_state.selected = "Chat"
    if st.button("👤 User Profile"):
        st.session_state.selected = "User Profile"
    if st.button("⚙️ Settings"):
        st.session_state.selected = "Settings"

    # Divider
    st.markdown("---")

    # Logout Button
    if st.button("🚪 Logout", key="logout_button"):
        st.session_state.authenticated = False
        st.session_state.user_id = None
        st.session_state.selected = "Main Page"
        st.rerun()


# ✅ Apply Global Custom CSS AFTER Login
# Custom CSS for Better UI
st.markdown("""
    <style>
        /* Background Gradient */
        .stApp {
            background: linear-gradient(to right, #e3f2fd, #bbdefb);
        }

        /* Sidebar Background */
        section[data-testid="stSidebar"] {
            background-color: #B0C4DE !important;
            color: #263238 !important;
        }

        /* Sidebar Text */
        section[data-testid="stSidebar"] * {
            color: #263238 !important;
            font-size: 18px !important;
        }

        /* Main Content Text Styling */
        h1.main-text {
            font-size: 32px !important;
            font-weight: bold;
            color: #102A43 !important;
        }

        h2.main-text {
            font-size: 28px !important;
            font-weight: bold;
            color: #102A43 !important;
        }

        /* Large Text for Features Section */
        .features-text {
            font-size: 22px !important;
            color: #102A43 !important;
            line-height: 1.6;
        }

        /* Button Styling */
        .stButton>button {
            width: 100%;
            border-radius: 10px;
            padding: 15px;
            margin: 8px 0;
            font-size: 18px;
            background-color: #1976d2;
            color: white;
            transition: all 0.3s ease;
            border: none;
        }
        .stButton>button:hover {
            background-color: #1565c0;
            transform: scale(1.05);
        }
    </style>
""", unsafe_allow_html=True)

# ✅ Page Navigation (Only After Login)
if st.session_state.selected == "Main Page":
    main_page_ui()
elif st.session_state.selected == "Chat":
    chat_ui()
elif st.session_state.selected == "User Profile":
    user_profile_ui()
elif st.session_state.selected == "Settings":
    settings_ui()
