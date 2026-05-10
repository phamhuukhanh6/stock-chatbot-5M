import os
import re
import json
import warnings
import datetime
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import google.generativeai as genai
import anthropic
from openai import OpenAI
from vnstock import Fundamental, Reference, Market
from passlib.context import CryptContext
from jose import JWTError, jwt

# --- Cấu hình bảo mật ---
SECRET_KEY = "your-secret-key-change-it" # Nên dùng wrangler secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    bot_type: str = "gemini" 
    plan: str = "free"
    session_id: Optional[int] = None
    folder_id: Optional[int] = None

# --- Helpers & Auth ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email: return None
        
        db = request.scope["env"].DB
        user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first()
        return user
    except:
        return None

# --- D1 Database Wrapper (Simplified) ---
class D1Manager:
    def __init__(self, db):
        self.db = db

    async def execute(self, query, *args):
        return await self.db.prepare(query).bind(*args).run()

    async def fetch_one(self, query, *args):
        return await self.db.prepare(query).bind(*args).first()

    async def fetch_all(self, query, *args):
        return await self.db.prepare(query).bind(*args).all()

# --- AI & Stock Logic ---
class Unified5MAnalyzer:
    def __init__(self, symbol):
        self.symbol = symbol.upper()
        self.fund = Fundamental()
        self.ref = Reference()
        self.market = Market()

    def get_raw_data(self):
        try:
            info_df = self.ref.company(symbol=self.symbol).info()
            ratios_df = self.fund.equity(symbol=self.symbol).ratios(period='year')
            ohlcv_df = self.market.equity(symbol=self.symbol).ohlcv(count=50)
            
            data_str = f"--- DỮ LIỆU {self.symbol} ---\n"
            if not info_df.empty:
                info = info_df.iloc[0]
                data_str += f"Ngành: {info.get('industry', 'N/A')}\n"
            
            if not ohlcv_df.empty:
                last_row = ohlcv_df.iloc[-1]
                last_price = last_row['close'] * 1000
                last_date = last_row['time'].strftime('%d/%m/%Y') if 'time' in last_row else "N/A"
                data_str += f"Giá đóng cửa phiên gần nhất ({last_date}): {last_price:,.0f} VND\n"
            
            return data_str
        except:
            return ""

async def call_llm_stream(env, bot_type, system_prompt, messages):
    limited_messages = messages[-10:]
    
    if bot_type == "gemini":
        genai.configure(api_key=env.GOOGLE_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        history = [{"role": "user" if m.role == "user" else "model", "parts": [m.content]} for m in limited_messages[:-1]]
        chat = model.start_chat(history=history)
        response = chat.send_message(f"{system_prompt}\n\nUser: {limited_messages[-1].content}", stream=True)
        for chunk in response:
            yield chunk.text
    
    elif bot_type == "claude":
        client = anthropic.Anthropic(api_key=env.ANTHROPIC_API_KEY)
        with client.messages.stream(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": m.role, "content": m.content} for m in limited_messages]
        ) as stream:
            for text in stream.text_stream:
                yield text
    
    else: # DeepSeek
        client = OpenAI(base_url="https://api.deepseek.com", api_key=env.DEEPSEEK_API_KEY)
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": system_prompt}, *[{"role": m.role, "content": m.content} for m in limited_messages]],
            stream=True
        )
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

# --- Endpoints ---

@app.post("/auth/register")
async def register(user: UserCreate, request: Request):
    db = request.scope["env"].DB
    exists = await db.prepare("SELECT id FROM users WHERE email = ?").bind(user.email).first()
    if exists: raise HTTPException(status_code=400, detail="Email đã tồn tại")
    
    hashed = get_password_hash(user.password)
    await db.prepare("INSERT INTO users (email, hashed_password, full_name) VALUES (?, ?, ?)").bind(user.email, hashed, user.full_name).run()
    return {"status": "success"}

@app.post("/auth/login")
async def login(request: Request):
    # Đọc form data thủ công vì Cloudflare Worker Python FastAPI Depends(OAuth2) có thể gặp lỗi scope
    form = await request.form()
    email = form.get("username")
    password = form.get("password")
    
    db = request.scope["env"].DB
    user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first()
    
    if not user or not verify_password(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")
    
    token = create_access_token(data={"sub": email})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/folders")
async def get_folders(request: Request):
    user = await get_current_user(request)
    if not user: return []
    db = request.scope["env"].DB
    folders = await db.prepare("SELECT * FROM folders WHERE user_id = ?").bind(user["id"]).all()
    return folders.results

@app.get("/sessions")
async def get_sessions(request: Request, folder_id: Optional[int] = None):
    user = await get_current_user(request)
    if not user: return []
    db = request.scope["env"].DB
    query = "SELECT * FROM chat_sessions WHERE user_id = ?"
    params = [user["id"]]
    if folder_id:
        query += " AND folder_id = ?"
        params.append(folder_id)
    query += " ORDER BY updated_at DESC"
    sessions = await db.prepare(query).bind(*params).all()
    return sessions.results

@app.get("/history/{session_id}")
async def get_history(session_id: int, request: Request):
    user = await get_current_user(request)
    if not user: raise HTTPException(status_code=401)
    db = request.scope["env"].DB
    msgs = await db.prepare("SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC").bind(session_id).all()
    return msgs.results

@app.post("/chat")
async def chat(chat_req: ChatRequest, request: Request):
    env = request.scope["env"]
    db = env.DB
    user = await get_current_user(request)
    
    async def event_generator():
        last_msg = chat_req.messages[-1].content
        session_id = chat_req.session_id
        
        if user:
            if not session_id:
                title = last_msg[:50]
                res = await db.prepare("INSERT INTO chat_sessions (title, user_id, folder_id) VALUES (?, ?, ?) RETURNING id").bind(title, user["id"], chat_req.folder_id).first()
                session_id = res["id"]
            else:
                await db.prepare("UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session_id).run()
            
            await db.prepare("INSERT INTO messages (content, role, session_id) VALUES (?, 'user', ?)").bind(last_msg, session_id).run()

        context_data = ""
        symbols = re.findall(r'\b[A-Z]{3,4}\b', last_msg.upper())
        if symbols:
            analyzer = Unified5MAnalyzer(symbols[0])
            context_data = analyzer.get_raw_data()

        today = datetime.datetime.now().strftime("ngày %d tháng %m năm %Y")
        system_prompt = f"Bạn là Chuyên gia Chứng khoán. Hôm nay là {today}. Dữ liệu {symbols[0] if symbols else ''}: {context_data}"
        
        full_res = ""
        async for chunk in call_llm_stream(env, chat_req.bot_type, system_prompt, chat_req.messages):
            full_res += chunk
            yield chunk
            
        if user and session_id:
            await db.prepare("INSERT INTO messages (content, role, session_id) VALUES (?, 'assistant', ?)").bind(full_res, session_id).run()

    return StreamingResponse(event_generator(), media_type="text/plain")
