import streamlit as st
from supabase_config import supabase
import base64
import streamlit.components.v1 as components

def get_base64_image(image_path):
    """Encode an image to Base64 for display in HTML"""
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode()

def fetch_user_data(user_id):
    try:
        user_profile_response = supabase.table("user_profile").select("*").eq("user_id_fk", user_id).execute()
    except Exception as e:
        print("DEBUG: Exception while fetching user profile:", e)
        return None, None, None, None

    user_profile = user_profile_response.data[0]

    # Fetch farmer details
    farmer_response = supabase.table("farmer").select("*").eq("user_profile_id_fk", user_profile["user_profile_id"]).execute()
    farmer = farmer_response.data[0] if farmer_response.data else None

    # Fetch all farms owned by this farmer
    farms_response = supabase.table("farm").select("*").eq("farmer_id_fk", farmer["farmer_id"]).execute() if farmer else None
    farms = farms_response.data if farms_response and farms_response.data else []

    # Fetch crops for each farm
    farm_crops = {}
    for farm in farms:
        farm_id = farm["farm_id"]
        crops_response = supabase.table("farm_crop").select("*").eq("farm_id_fk", farm_id).execute()
        farm_crops[farm_id] = crops_response.data if crops_response.data else []

    return user_profile, farmer, farms, farm_crops

def fetch_crop_details(crop_id):
    """Fetch crop name and varietal using crop_id"""
    crop_response = supabase.table("crop").select("name, varietal").eq("crop_id", crop_id).execute()
    if crop_response.data:
        crop = crop_response.data[0]
        return f"{crop['name']} ({crop['varietal']})"
    return "Unknown Crop"

def user_profile_ui():
    # Ensure that the user_id is available before proceeding
    user_id = st.session_state.get("user_id")
    if not user_id:
        st.warning("User ID is not available yet. Please wait...")
        st.stop()  # Prevent further execution until the session is updated

    # Fetch user data
    user_profile, farmer, farms, farm_crops = fetch_user_data(user_id)

    if not user_profile:
        st.error("❌ User data not found. Please try again later.")
        return

    # ✅ Profile Card
    base64_avatar = get_base64_image("assets/default-avatar.png")

    st.markdown(f"""
        <style>
            .profile-card {{
                background: white;
                border-radius: 15px;
                padding: 2rem;
                margin-bottom: 2rem;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: start;
                gap: 2rem;
            }}
            .avatar-container img {{
                width: 150px;
                height: 150px;
                border-radius: 50%;
                object-fit: cover;
                border: 3px solid #4CAF50;
            }}
            .profile-info h2 {{
                color: #000;
                margin-bottom: 1rem;
                font-size: 24px;
            }}
            .profile-info p {{
                margin: 0.5rem 0;
                color: #000;
                font-size: 16px;
            }}
        </style>
        <div class="profile-card">
            <div class="avatar-container">
                <img src="data:image/png;base64,{base64_avatar}" alt="Profile Avatar">
            </div>
            <div class="profile-info">
                <h2>{farmer['first_name']} {farmer['last_name'] if farmer else 'N/A'}</h2>
                <p><strong>Email:</strong> {user_profile['default_email']}</p>
                <p><strong>Phone:</strong> {user_profile['default_phone']}</p>
                <p><strong>Age:</strong> {2025 - int(farmer['yob']) if farmer and farmer['yob'] else 'N/A'}</p>
                <p><strong>Gender:</strong> {farmer['gender'] if farmer else 'N/A'}</p>
            </div>
        </div>
    """, unsafe_allow_html=True)

    # ✅ Farms & Crops Section
    st.markdown('<h2 style="color:#000;">🏡 Farms Owned</h2>', unsafe_allow_html=True)

    st.markdown("""
        <style>
            .custom-table {
                width: 100%;
                border-collapse: collapse;
            }
            .custom-table th, .custom-table td {
                border: 2px solid #ddd;
                padding: 15px;
                text-align: left;
            }
            .custom-table th {
                background-color: #4CAF50;
                color: white;
                font-size: 18px;
            }
            .farm-card {
                background: white;
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 10px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .farm-header {
                font-size: 20px;
                font-weight: bold;
                color: black;
            }
            .crop-card {
                background: #f5f5f5;
                border-radius: 8px;
                padding: 10px;
                margin-top: 8px;
            }
            .crop-name {
                font-weight: bold;
                color: black;
            }
        </style>
    """, unsafe_allow_html=True)

    for farm in farms:
        farm_id = farm["farm_id"]

        # **Farm Details (Properly formatted)**
        farm_info = f"""
            <div class="farm-card" style="background: white; padding: 15px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);">
                <p class="farm-header" style="font-size: 20px; font-weight: bold; color: black;">📍 {farm['city']}, {farm['province']}</p>
                <p style="color: black;"><strong>📏 Size:</strong> {farm['farm_size']} {farm['farm_size_unit']}</p>
                <p style="color: black;"><strong>🌍 Country:</strong> {farm['country']}</p>
                <p style="color: black;"><strong>📌 Coordinates:</strong> {farm['coordinates'] if farm['coordinates'] else 'Not Available'}</p>
                <hr>
                <p style="color: black; font-size: 18px;"><strong>🌱 Crops Grown:</strong></p>
        """

        # **Accumulate Crops Inside the Farm `<div>`**
        crops_html = ""
        if farm_id in farm_crops and farm_crops[farm_id]:
            for crop in farm_crops[farm_id]:
                crop_name = fetch_crop_details(crop['crop_id_fk'])  # Fetch Name & Varietal
                crops_html += f"""
                    <div class="crop-card" style="background: #f8f8f8; padding: 10px; border-radius: 8px; margin-bottom: 10px;">
                        <p class="crop-name" style="color: black; font-weight: bold;">🌿 {crop_name}</p>
                        <p style="color: black;">Planted Year: {crop['planted_year']}</p>
                        <p style="color: black;">Crop Count: {crop['crop_count']}</p>
                    </div>
                """
        else:
            crops_html = '<p style="color: black;">No crops recorded.</p>'

        # **Combine Farm & Crops HTML Correctly**
        full_html = farm_info + crops_html + "</div>"

        # ✅ **Fix: Use `st.components.v1.html()` to Render HTML Properly**
        components.html(full_html, height=400, scrolling=True)






    # End the table
    st.markdown("</tbody></table>", unsafe_allow_html=True)


    # ✅ Logout Button
    if st.button("Logout", help="Click to log out"):
        st.session_state.authenticated = False
        st.session_state.user_id = None
        st.session_state.user_data = None
        st.rerun()
