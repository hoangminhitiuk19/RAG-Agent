(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const a of r)if(a.type==="childList")for(const s of a.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function o(r){const a={};return r.integrity&&(a.integrity=r.integrity),r.referrerPolicy&&(a.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?a.credentials="include":r.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(r){if(r.ep)return;r.ep=!0;const a=o(r);fetch(r.href,a)}})();const E="https://rag-system-test-232745515787.asia-southeast1.run.app",B="https://kgbfhcjzsujcrmjjavdm.supabase.co",j="your-default-supabase-anon-key",z="1.0.1",Q="42aadddb-6fad-4745-aecd-62b1fe172c90",q="bbc3bcea-fe45-44de-a37a-2d1a524c5ac0";function J(){return{messageInput:document.getElementById("message-input"),sendButton:document.getElementById("send-button"),chatMessages:document.getElementById("chat-messages"),typingIndicator:document.getElementById("typing-indicator"),conversationId:document.getElementById("conversation-id"),statusIndicator:document.getElementById("status-indicator"),newChatButton:document.getElementById("new-chat-button"),conversationList:document.getElementById("conversation-list"),imageUpload:document.getElementById("image-upload"),imagePreview:document.getElementById("image-preview")}}const l={currentConversationId:null,conversations:[],currentImageUrl:null,userProfileId:null,farmId:null};function y(e){return l.currentConversationId=e,l.currentConversationId}function C(){return l.currentConversationId}function T(e){return l.currentImageUrl=e,l.currentImageUrl}function me(){l.currentImageUrl=null}function D(){return l.currentImageUrl}function L(){return l.conversations}function P(e){l.conversations=e}function V(e){return l.conversations.push(e),l.conversations}function G(e,t){const o=l.conversations.findIndex(n=>n.id===e);return o!==-1?(l.conversations[o]={...l.conversations[o],...t},l.conversations[o]):null}function fe(e){return l.conversations.find(t=>t.id===e)}function _(e){return l.userProfileId=e,l.userProfileId}function M(){return l.userProfileId}function N(e){return l.farmId=e,l.farmId}function K(){return l.farmId}function W(){return{...l}}const pe=Object.freeze(Object.defineProperty({__proto__:null,addConversation:V,clearCurrentImageUrl:me,findConversation:fe,getConversationId:C,getConversations:L,getCurrentImageUrl:D,getFarmId:K,getFullState:W,getUserProfileId:M,setConversationId:y,setConversations:P,setCurrentImageUrl:T,setFarmId:N,setUserProfileId:_,updateConversation:G},Symbol.toStringTag,{value:"Module"}));async function Y(e,t){const o=document.getElementById("image-preview"),n=M();o.innerHTML='<div class="loading">Uploading...</div>';try{console.log("Starting image upload to Supabase...");const r=Date.now(),a=Math.random().toString(36).substring(2,10),s=e.name.split(".").pop(),d=`${n}/${r}-${a}.${s}`;console.log("Generated filename:",d);const{data:i,error:u}=await t.storage.from("crop-images").upload(d,e,{cacheControl:"3600",upsert:!1});if(u)throw new Error(`Supabase upload error: ${u.message}`);console.log("File uploaded successfully:",i);const{publicUrl:c}=t.storage.from("crop-images").getPublicUrl(d).data;console.log("Public URL:",c),T(c),o.innerHTML=`
            <img src="${c}" class="preview-image" />
            <button class="remove-image" title="Remove image"><i class="fas fa-times"></i></button>
        `,document.querySelector(".remove-image").addEventListener("click",he),document.getElementById("send-button").disabled=!1,console.log("Image upload complete and preview shown")}catch(r){console.error("Error uploading image:",r),o.innerHTML="Upload failed. Please try again.",setTimeout(()=>{o.textContent==="Upload failed. Please try again."&&(o.innerHTML="")},3e3)}}function he(){document.getElementById("image-preview").innerHTML="",T(null),document.getElementById("message-input").value.trim()||(document.getElementById("send-button").disabled=!0)}async function ve(e,t){if(!e)return null;try{if(console.log("Attempting to retrieve image:",e),e.includes(B)){const o=e.split("/"),n="crop-images",r=o.findIndex(a=>a===n);if(r!==-1&&r<o.length-1){const a=o.slice(r+1).join("/").split("?")[0];console.log("Extracted object path:",a);const{data:s,error:d}=await t.storage.from(n).createSignedUrl(a,60);return d?(console.error("Error creating signed URL:",d),e):s.signedUrl||e}}return e}catch(o){return console.error("Error retrieving Supabase image:",o),e}}async function ye(e){console.log("Attempting to recover failed images...");const t=document.querySelectorAll(".message-image.failed-image");let o=0;for(let n=0;n<t.length;n++){const r=t[n],a=r.getAttribute("data-original-url");if(a){console.log(`Recovering image ${n+1}/${t.length}: ${a}`);try{const s=await ve(a,e);s&&(r.classList.remove("failed-image"),r.onload=()=>o++,r.onerror=function(){this.onerror=null,this.src="data:image/svg+xml;base64,...",this.classList.add("failed-image")},r.src=s.includes("?")?`${s}&t=${Date.now()}`:`${s}?t=${Date.now()}`)}catch(s){console.error(`Error recovering image ${n+1}:`,s)}}}return`Recovery attempt complete. ${o}/${t.length} images recovered.`}function I(e){const t=document.getElementById("status-indicator");if(!t)return;t.classList.remove("online","offline","connecting"),t.classList.add(e);let o="Connected";e==="offline"&&(o="Disconnected"),e==="connecting"&&(o="Connecting..."),t.setAttribute("title",o)}async function X(e){try{I("connecting"),(await fetch(`${E}/health`,{method:"GET",headers:{"Content-Type":"application/json"}})).ok?I("online"):I("offline")}catch(t){console.error("API Health check failed:",t),I("offline")}}function Z(e,t,o,n){const{messageInput:r,sendButton:a,newChatButton:s,imageUpload:d}=e;r.addEventListener("input",()=>{a.disabled=r.value.trim()==="",r.style.height="auto",r.style.height=Math.min(r.scrollHeight,150)+"px"}),r.addEventListener("keydown",i=>{if(i.key==="Enter"&&!i.shiftKey){i.preventDefault();const u=D();(!a.disabled||u)&&t()}}),a.addEventListener("click",t),s.addEventListener("click",o),we(d,n),document.addEventListener("paste",i=>Ie(i,n))}function we(e,t){e.addEventListener("change",o=>{const n=o.target.files[0];n&&t(n),o.target.value=""})}function Ie(e,t){const o=document.getElementById("message-input");if(document.activeElement!==o&&!e.target.closest(".chat-interface"))return;const n=(e.clipboardData||e.originalEvent.clipboardData).items;for(let r=0;r<n.length;r++)if(n[r].type.indexOf("image")!==-1){e.preventDefault();const a=n[r].getAsFile();t(a);break}}function w(e,t="agent",o=new Date,n=null){const r=document.getElementById("chat-messages");if(!r)return;const a=document.createElement("div");a.className=`message ${t}-message`;const s=document.createElement("div");s.className="message-avatar",s.innerHTML=t==="user"?'<i class="fas fa-user"></i>':t==="system"?'<i class="fas fa-exclamation-circle"></i>':'<i class="fas fa-leaf"></i>',a.appendChild(s);const d=document.createElement("div");d.className="message-content",n&&(d.innerHTML=`<div class="message-image-container"><img src="${n}" class="message-image" alt="Shared image"></div>`),d.innerHTML+=t==="user"?e:Ee(e),a.appendChild(d);const i=document.createElement("div");return i.className="message-time",i.textContent=o.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),a.appendChild(i),r.appendChild(a),k(),a}function Ee(e){return e?(e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*(.*?)\*/g,"<em>$1</em>"),e=e.replace(/^\s*-\s+(.*?)$/gm,"<li>$1</li>").replace(/(<li>.*?<\/li>)/gs,"<ul>$1</ul>"),e=`<p>${e.replace(/\n\n/g,"</p><p>")}</p>`,e):""}function k(){const e=document.getElementById("chat-messages");e&&(e.scrollTop=e.scrollHeight)}function x(){y(null),document.getElementById("conversation-id").textContent="New conversation",document.getElementById("chat-messages").innerHTML="",w("Hello! I'm your Farming Assistant. How can I help you today?","agent"),document.querySelectorAll(".conversation-item.active").forEach(t=>t.classList.remove("active"))}function U(e){y(e),document.getElementById("conversation-id").textContent=e||"New conversation"}function $(e,t,o){if(e)try{const n=L(),r=n.findIndex(a=>a.id===e);r>=0?G(e,{lastUpdated:new Date().toISOString(),isComplete:t||n[r].isComplete}):V({id:e,title:be(o),lastUpdated:new Date().toISOString(),isComplete:t||!1}),localStorage.setItem("conversations",JSON.stringify(L())),localStorage.setItem("currentConversationId",e),ee()}catch(n){console.error("Error saving conversation:",n)}}function be(e){if(!e)return"New conversation";const t=e.trim().split(" ");let n=t.slice(0,5).join(" ");return t.length>5&&(n+="..."),n}function ee(){const e=L(),t=document.getElementById("conversation-list"),o=C();if(!t)return;t.innerHTML="",[...e].sort((r,a)=>new Date(a.lastUpdated)-new Date(r.lastUpdated)).forEach(r=>{const a=document.createElement("div");a.className="conversation-item",a.dataset.id=r.id,r.id===o&&a.classList.add("active"),a.innerHTML=`
            <span class="conversation-title">${r.title}</span>
            <span class="conversation-time">${Ce(r.lastUpdated)}</span>
        `,a.addEventListener("click",()=>te(r.id)),t.appendChild(a)})}function Ce(e){const t=new Date(e),o=new Date;if(t.toDateString()===o.toDateString())return t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});const n=new Date(o);if(n.setDate(n.getDate()-7),t>n){const a={weekday:"short"};return t.toLocaleDateString([],a)}const r={month:"short",day:"numeric"};return t.toLocaleDateString([],r)}async function te(e,t,o){try{y(e),localStorage.setItem("currentConversationId",e),document.querySelectorAll(".conversation-item").forEach(s=>{s.classList.toggle("active",s.dataset.id===e)}),document.getElementById("conversation-id").textContent=e,o.innerHTML="";const n=document.createElement("div");n.className="system-message",n.textContent="Loading conversation...",o.appendChild(n);const r=await fetch(`${t}/conversations/${e}`);if(!r.ok)throw new Error(`Failed to load conversation: ${r.status}`);const a=await r.json();return o.removeChild(n),a&&a.messages&&a.messages.length?a.messages.forEach(s=>{w(s.content,s.role)}):w("No messages found in this conversation.","system"),a}catch(n){return console.error("Error loading conversation:",n),w(`Error: ${n.message}`,"system"),null}}let A=null,b="";function O(){if(A&&b)try{A.innerHTML=typeof marked<"u"?marked.parse(b):R(b)}catch(e){console.error("Error in final markdown parsing:",e),A.innerHTML=R(b)}A=null,b=""}function R(e){return e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*(.*?)\*/g,"<em>$1</em>"),e=e.replace(/^\s*-\s+(.*?)$/gm,"<li>$1</li>").replace(/(<li>.*?<\/li>)/gs,"<ul>$1</ul>"),e=`<p>${e.replace(/\n\n/g,"</p><p>")}</p>`,e}let p=null,f=null,v="";function Se(e,t=""){const o=document.getElementById("chat-messages");if(!f){if(!p){ne(),p=document.createElement("div"),p.className="message agent-message";const n=document.createElement("div");n.className="message-avatar",n.innerHTML='<i class="fas fa-leaf"></i>',p.appendChild(n);const r=document.createElement("div");r.className="message-time",r.textContent=new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),p.appendChild(r),o.appendChild(p)}f=document.createElement("div"),f.className="message-content",p.insertBefore(f,p.querySelector(".message-time")),v=""}if(v+=e,t==="loading-text"){let n=f.querySelector(`.${t}`);n||(n=document.createElement("div"),n.className=t,f.appendChild(n)),n.textContent=e}else try{typeof marked<"u"?f.innerHTML=marked.parse(v):f.innerHTML=F(v)}catch(n){console.error("Markdown parsing error:",n),f.innerHTML=F(v)}k()}function ne(){document.getElementById("typing-indicator").classList.add("hidden")}function F(e){return e?(e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*(.*?)\*/g,"<em>$1</em>"),e=e.replace(/^\s*-\s+(.*?)$/gm,"<li>$1</li>").replace(/(<li>.*?<\/li>)/gs,"<ul>$1</ul>"),e=`<p>${e.replace(/\n\n/g,"</p><p>")}</p>`,e):""}function $e(e,t){if(!(t!=null&&t.length))return;const o=document.createElement("div");o.className="sources-container",o.innerHTML="<h4>Sources</h4>";const n=document.createElement("ul");n.className="sources-list",t.forEach(r=>{var s;const a=document.createElement("li");a.className="source-item",a.textContent=((s=r.metadata)==null?void 0:s.filename)||"Unknown source",n.appendChild(a)}),o.appendChild(n),e.appendChild(o)}function Ae(e,t){if(!(t!=null&&t.length))return;const o=document.createElement("div");o.className="follow-up-container",t.forEach(n=>{const r=typeof n=="string"?n:n.text,a=document.createElement("button");a.className="follow-up-button",a.textContent=r,a.addEventListener("click",()=>{const s=document.getElementById("message-input");s.value=r,s.dispatchEvent(new Event("input")),s.focus()}),o.appendChild(a)}),e.appendChild(o)}async function Le(e,t=!1){var u;const o=document.getElementById("chat-messages"),n=e.body.getReader(),r=new TextDecoder("utf-8");let a="",s=[],d=[],i=C();try{if(p=f=null,v="",t){const m=document.createElement("div");m.className="translation-notice",m.innerHTML='<i class="fas fa-language"></i> Query translated to English.',o.appendChild(m)}const c=(u=e.headers)==null?void 0:u.get("X-Conversation-Id");for(c&&(i=c,y(i),U(i),$(i,!1));;){const{done:m,value:S}=await n.read();if(m)break;a+=r.decode(S,{stream:!0});let h;for(;(h=a.indexOf(`

`))>=0;){const H=a.substring(0,h).trim();if(a=a.substring(h+2),H.startsWith("data: "))try{const g=JSON.parse(H.slice(6));console.log("Received data:",g),g.type==="info"&&g.conversation_id?(i=g.conversation_id,y(i),U(i),$(i,!1),console.log("Conversation ID set to:",i)):g.conversation_id&&!i?(i=g.conversation_id,y(i),U(i),$(i,!1),console.log("Alternative format: Conversation ID set to:",i)):g.clear_loading?document.querySelectorAll(".message-content .loading-text").forEach(ge=>ge.remove()):g.text_chunk?Se(g.text_chunk,g.is_loading?"loading-text":""):g.sources?s=g.sources:g.follow_up_questions?d=g.follow_up_questions:g.complete&&(O(),i?$(i,!0,v):console.warn("No conversation ID available for completed message"),s.length>0&&$e(p,s),d.length>0&&Ae(p,d))}catch(g){console.error("Error parsing event data:",g)}}}f&&O()}catch(c){console.error("Error processing stream:",c),ne(),w(`Error: Could not process response: ${c.message}`,"system")}return k(),{conversationId:i,messageContent:v}}async function oe({messageInput:e,sendButton:t,typingIndicator:o,statusIndicator:n}){const r=C(),a=D(),s=M(),d=K(),i=e.value.trim();if(!(!i&&!a))try{e.disabled=!0,t.disabled=!0,De(),w(i,"user"),e.value="";const u={user_profile_id:s,farm_id:d,message:i};r?(u.conversation_id=r,console.log("Using existing conversation ID:",r)):console.log("Starting new conversation (no ID yet)"),a&&(u.image_url=a,Be()),console.log("Sending message with data:",u);const c=await fetch(`${E}/api/chat/message/stream`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)});if(!c.ok)throw new Error(`API returned ${c.status}: ${await c.text()}`);const{conversationId:m}=await Le(c);m&&m!==r&&(console.log("Conversation ID updated:",m),y(m)),I("online")}catch(u){console.error("Error sending message:",u),w(`Error: ${u.message}`,"system"),I("offline")}finally{e.disabled=!1,e.focus(),t.disabled=!1,Ue()}}function De(){document.getElementById("typing-indicator").classList.remove("hidden")}function Ue(){document.getElementById("typing-indicator").classList.add("hidden")}function Be(){const e=document.getElementById("image-preview");e&&(e.innerHTML="")}async function re(e){}const Te="1.0.2";async function ae(){console.log("Forcefully clearing ALL caches..."),localStorage.removeItem("conversations"),localStorage.removeItem("currentConversationId");const e=localStorage.getItem("currentUserProfileId");if(localStorage.clear(),e&&localStorage.setItem("currentUserProfileId",e),console.log("LocalStorage cleared (preserved user profile)"),sessionStorage.clear(),console.log("SessionStorage cleared"),"caches"in window)try{const o=(await caches.keys()).map(n=>(console.log(`Deleting cache: ${n}`),caches.delete(n)));await Promise.all(o),console.log("Cache API caches cleared")}catch(t){console.error("Error clearing Cache API caches:",t)}if("indexedDB"in window)try{typeof indexedDB.databases=="function"?(await indexedDB.databases()).forEach(o=>{console.log(`Deleting IndexedDB database: ${o.name}`);try{const n=indexedDB.deleteDatabase(o.name);n.onsuccess=()=>console.log(`Successfully deleted ${o.name}`),n.onerror=()=>console.error(`Failed to delete ${o.name}`)}catch(n){console.error(`Error deleting database ${o.name}:`,n)}}):console.log("indexedDB.databases() not supported in this browser")}catch(t){console.error("Error clearing IndexedDB databases:",t)}return localStorage.setItem("page_load_timestamp",Date.now().toString()),localStorage.setItem("app_version",Te),localStorage.setItem("ignore_conversation_history","true"),!0}function se(){if(console.log("Setting up cache prevention..."),localStorage.setItem("last-app-update",Date.now().toString()),localStorage.getItem("ignore_conversation_history")==="true"&&(console.log("Fresh page load detected, history will be ignored"),localStorage.removeItem("ignore_conversation_history")),!window.location.href.includes("cache_bust=")){const e=window.location.href.includes("?")?"&":"?";window.cacheBustParam=`${e}cache_bust=${Date.now()}`}window.addEventListener("beforeunload",()=>{localStorage.setItem("page_unloading","true")})}function ie(){const e=document.createElement("style");e.textContent=`
        .translation-notice {
            font-size: 0.8em;
            color: #666;
            text-align: center;
            margin: 5px 0;
            padding: 5px;
            background-color: rgba(255, 255, 200, 0.3);
            border-radius: 5px;
        }
        
        .translation-notice i {
            margin-right: 5px;
        }
    `,document.head.appendChild(e)}function ce(){if(!window.DEV_MODE)return;const e=document.createElement("button");e.textContent="🔄 Reload App",e.style.position="fixed",e.style.bottom="10px",e.style.left="10px",e.style.zIndex="9999",e.style.background="#ff5722",e.style.color="white",e.style.border="none",e.style.borderRadius="4px",e.style.padding="8px 12px",e.style.cursor="pointer",e.addEventListener("click",()=>{console.log("Forcing reload without cache..."),window.location.reload(!0)}),document.body.appendChild(e),ee()}function Pe(){return confirm("Are you sure you want to clear all conversation history? This cannot be undone.")?(localStorage.removeItem("coffee-assistant-conversations-v2"),localStorage.removeItem("coffee-assistant-conversations"),renderConversations(),x(),"All conversations cleared"):"Operation cancelled"}async function _e(){try{const e=await fetch(`${E}/health`,{method:"GET"}),t=await e.text();let o;try{o=JSON.parse(t)}catch{o={error:"Failed to parse response",text:t.substring(0,200)}}return console.log("System status response:",o),{success:e.ok,status:e.status,data:o,timestamp:new Date().toISOString()}}catch(e){return console.error("Error testing system status:",e),{success:!1,error:e.message}}}async function Me(e,t){try{const n=await(await fetch(`${E}/api/chat/debug-conversation/${e||t}`,{method:"GET",headers:{"Content-Type":"application/json"}})).text();let r;try{r=JSON.parse(n)}catch{r={error:"Failed to parse response",text:n.substring(0,200)}}return console.log("Conversation debug data:",r),r}catch(o){return console.error("Error testing conversation history:",o),{error:o.message}}}async function Ne(e,t,o){var u;console.log("Testing Supabase upload...");const r=atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),a=new ArrayBuffer(r.length),s=new Uint8Array(a);for(let c=0;c<r.length;c++)s[c]=r.charCodeAt(c);const d=new Blob([s],{type:"image/png"}),i=new File([d],"test-image.png",{type:"image/png"});console.log("Test file created:",i);try{const c=`test/test-${Date.now()}.png`;console.log(`Uploading test file to ${c}...`);const{data:m,error:S}=await e.storage.from("crop-images").upload(c,i);if(S)throw new Error(`Upload test failed: ${S.message}`);console.log("Upload succeeded:",m);const h=e.storage.from("crop-images").getPublicUrl(c);if(!((u=h==null?void 0:h.data)!=null&&u.publicUrl))throw new Error("Could not generate public URL");return console.log("Testing full upload function..."),await t(i),{success:!0,directUrl:h.data.publicUrl,functionalUrl:o}}catch(c){return console.error("Test failed:",c),{success:!1,error:c.message}}}function ke(){console.log("Debug functions defined directly on window object:",{testQdrant:typeof window.testQdrant=="function",testConversationHistory:typeof window.testConversationHistory=="function",checkConversationEndpoint:typeof window.checkConversationEndpoint=="function",inspectEnrichedContext:typeof window.inspectEnrichedContext=="function",testContextInAgentResponse:typeof window.testContextInAgentResponse=="function"})}function le(e,t,o){window.getState=W,window.clearAllConversations=Pe,window.recoverImages=()=>ye(e),window.testSupabaseUpload=n=>Ne(e,n,D()),window.testQdrant=_e,window.testConversationHistory=n=>Me(n||C()),window.loadConversation=async n=>te(n,t,o),ke()}function de(e,t){try{return typeof window.supabaseJs<"u"?window.supabaseJs.createClient(e,t):typeof window.supabase<"u"&&window.supabase.createClient?window.supabase.createClient(e,t):(console.error("Supabase client library not found"),null)}catch(o){return console.error("Failed to initialize Supabase client:",o),null}}function ue(e){return e&&typeof e.storage<"u"}document.addEventListener("DOMContentLoaded",async()=>{console.log(`Starting app version: ${z}`),console.log("Page load timestamp:",Date.now());const e=J();await ae(),se(),ie(),ce();const t=de(B,j);ue(t)||console.error("Failed to initialize Supabase client. Some features may not work.");const o=localStorage.getItem("currentUserProfileId")||Q;_(o),N(q),P([]),Z(e,()=>oe({...e}),x,n=>Y(n,t)),await re(),X(),le(t,E,e.chatMessages),console.log("Application initialization complete with cache clearing")});document.addEventListener("DOMContentLoaded",async()=>{console.log(`Starting app version: ${z}`),console.log("Page load timestamp:",Date.now());const e=J();await ae(),se(),ie(),ce();const t=de(B,j);ue(t)||console.error("Failed to initialize Supabase client. Some features may not work.");const o=localStorage.getItem("currentUserProfileId")||Q;_(o),N(q),P([]),Z(e,()=>oe({...e}),x,n=>Y(n,t)),await re(),X(),le(t,E,e.chatMessages),console.log("Application initialization complete with cache clearing")});window.State=pe;
