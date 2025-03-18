import streamlit as st

def main_page_ui():
    # ✅ Custom CSS for Background & Styling (No <div>, Only Inline Styling)
    st.markdown("""
        <style>
            /* Set background gradient */
            .stApp {
                background: linear-gradient(to right, #e3f2fd, #bbdefb);
            }

            /* Center content */
            .main-content {
                text-align: center;
                padding-top: 20px;
            }

            /* Main Titles */
            .main-title {
                font-size: 40px !important;
                font-weight: bold;
                color: #000000 !important;
                text-align: center;
            }

            .sub-title {
                font-size: 32px !important;
                font-weight: bold;
                color: #000000 !important;
                text-align: center;
            }

            /* Properly Style the List */
            .feature-list {
                list-style-type: disc;
                padding-left: 40px;
                color: #000000 !important;
                font-size: 24px !important;
                font-weight: bold;
            }

            /* Horizontal Divider */
            hr {
                border: 1px solid #1976D2;
                margin: 40px 0;
            }
        </style>
    """, unsafe_allow_html=True)

    # ✅ Page Content (Each Section Uses Inline CSS for Black Text)
    st.markdown('<h1 class="main-title">🌿 RegenX - Your Agricultural AI Assistant</h1>', unsafe_allow_html=True)
    st.markdown('<h2 class="sub-title">🏠 Welcome to RegenX AI Assistant</h2>', unsafe_allow_html=True)

    # ✅ Features Section - Using Inline CSS for Black Text Instead of <div>
    st.markdown('<p style="font-size: 24px; color: #000000; font-weight: bold;">🌱 <b>AI Assistant</b> helps farmers improve crop management with regenerative agriculture.</p>', unsafe_allow_html=True)

    st.markdown('<p style="font-size: 24px; color: #000000; font-weight: bold;">🔍 <b>Features:</b></p>', unsafe_allow_html=True)

    st.markdown("""
        <ul style="font-size: 24px; color: #000000; font-weight: bold;">
            <li>🌾 AI-powered chat for <b>agricultural advice</b></li>
            <li>🌤️ Real-time <b>weather insights</b></li>
            <li>🏡 Personalized <b>farm management tips</b></li>
            <li>📷 Disease detection using <b>image uploads</b></li>
        </ul>
    """, unsafe_allow_html=True)

    # ✅ Mission Statement - Inline Styling for Black Text
    st.markdown('<hr>', unsafe_allow_html=True)
    st.markdown('<p style="font-size: 26px; color: #000000; font-weight: bold; text-align: center;">📍 Our Mission: Empowering farmers with technology to increase sustainability and productivity in agriculture.</p>', unsafe_allow_html=True)
    st.markdown('<hr>', unsafe_allow_html=True)
