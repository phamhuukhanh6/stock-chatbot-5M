import os
import re
import json
import warnings
import datetime
import hashlib
import base64
import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from dotenv import load_dotenv
import google.generativeai as genai
import anthropic
import asyncio
from openai import OpenAI
from vnstock import Fundamental, Reference, Market
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt

from database import engine, Base, SessionLocal, get_db
import models

# Khởi tạo database
models.Base.metadata.create_all(bind=engine)

load_dotenv()
warnings.filterwarnings('ignore')

# Cấu hình bảo mật
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-for-jwt-change-it-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserResponse(BaseModel):
    email: str
    full_name: str
    id: int
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class FolderCreate(BaseModel):
    name: str

class FolderResponse(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class SessionResponse(BaseModel):
    id: int
    title: str
    folder_id: Optional[int]
    updated_at: datetime.datetime
    class Config:
        from_attributes = True

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    bot_type: str = "gemini" 
    plan: str = "free"
    session_id: Optional[int] = None
    folder_id: Optional[int] = None

# Helpers
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        return None
    user = db.query(models.User).filter(models.User.email == email).first()
    return user

# Auth Endpoints
@app.post("/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    try:
        db_user = db.query(models.User).filter(models.User.email == user.email).first()
        if db_user:
            raise HTTPException(status_code=400, detail="Email đã tồn tại trên hệ thống")
        
        hashed_password = get_password_hash(user.password)
        new_user = models.User(
            email=user.email,
            hashed_password=hashed_password,
            full_name=user.full_name
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        print(f"REGISTRATION ERROR: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi đăng ký hệ thống: {str(e)}")

@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# Folder Endpoints
@app.get("/folders", response_model=List[FolderResponse])
async def get_folders(db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    if not current_user: return []
    return db.query(models.Folder).filter(models.Folder.user_id == current_user.id).all()

@app.post("/folders", response_model=FolderResponse)
async def create_folder(folder: FolderCreate, db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Bạn cần đăng nhập để tạo thư mục")
    new_folder = models.Folder(name=folder.name, user_id=current_user.id)
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

@app.delete("/folders/{folder_id}")
async def delete_folder(folder_id: int, db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Bạn cần đăng nhập")
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id, models.Folder.user_id == current_user.id).first()
    if not folder: raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(folder)
    db.commit()
    return {"status": "success"}

# Session Endpoints
@app.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(folder_id: Optional[int] = None, db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    if not current_user: return []
    query = db.query(models.ChatSession).filter(models.ChatSession.user_id == current_user.id)
    if folder_id:
        query = query.filter(models.ChatSession.folder_id == folder_id)
    return query.order_by(models.ChatSession.updated_at.desc()).all()

@app.get("/history/{session_id}", response_model=List[dict])
async def get_history(session_id: int, db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Bạn cần đăng nhập để xem lịch sử")
    session = db.query(models.ChatSession).filter(models.ChatSession.id == session_id, models.ChatSession.user_id == current_user.id).first()
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    
    messages = db.query(models.Message).filter(models.Message.session_id == session_id).order_by(models.Message.timestamp.asc()).all()
    return [{"role": m.role, "content": m.content, "timestamp": m.timestamp} for m in messages]

# Cấu hình AI
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
gemini_model = genai.GenerativeModel('gemini-2.0-flash')
claude_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
openrouter_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=os.getenv("OPENROUTER_API_KEY"),
)
deepseek_client = OpenAI(
  base_url="https://api.deepseek.com",
  api_key=os.getenv("DEEPSEEK_API_KEY"),
)

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
            
            if not ratios_df.empty:
                core_metrics = ['ticker', 'year', 'roe', 'roa', 'net_profit_margin', 'gross_profit_margin', 'debt_to_equity', 'pe', 'pb']
                available_metrics = [m for m in core_metrics if m in ratios_df.columns]
                top_ratios = ratios_df[available_metrics].head(3)
                data_str += f"Chỉ số chính:\n{top_ratios.to_string(index=False)}\n"
            
            if not ohlcv_df.empty:
                last_row = ohlcv_df.iloc[-1]
                last_price = last_row['close'] * 1000 # Chuyển đổi sang VND thực tế
                last_date = last_row['time'].strftime('%d/%m/%Y') if 'time' in last_row else "N/A"
                data_str += f"Giá đóng cửa phiên gần nhất ({last_date}): {last_price:,.0f} VND\n"
            
            return data_str
        except Exception as e:
            print(f"Error fetching data for {self.symbol}: {e}")
            return ""

async def call_llm_stream(bot_type, system_prompt, messages):
    limited_messages = messages[-10:]
    
    if bot_type == "gemini":
        history = []
        for m in limited_messages[:-1]:
            history.append({"role": "user" if m.role == "user" else "model", "parts": [m.content]})
        chat_session = gemini_model.start_chat(history=history)
        final_prompt = f"{system_prompt}\n\nUser: {limited_messages[-1].content}"
        response = chat_session.send_message(final_prompt, stream=True)
        for chunk in response:
            yield chunk.text
    
    elif bot_type == "claude":
        with claude_client.messages.stream(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": m.role if m.role != "assistant" else "assistant", "content": m.content} for m in limited_messages]
        ) as stream:
            for text in stream.text_stream:
                yield text
    
    else: # openrouter/deepseek
        try:
            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    *[{"role": m.role if m.role != "assistant" else "assistant", "content": m.content} for m in limited_messages]
                ],
                stream=True
            )
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            print(f"Direct DeepSeek API failed, falling back to OpenRouter: {e}")
            response = openrouter_client.chat.completions.create(
                model="deepseek/deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    *[{"role": m.role if m.role != "assistant" else "assistant", "content": m.content} for m in limited_messages]
                ],
                stream=True
            )
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

@app.post("/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db), current_user: Optional[models.User] = Depends(get_current_user)):
    async def event_generator():
        try:
            last_msg_content = request.messages[-1].content
            active_session_id = request.session_id

            if current_user:
                # 1. Quản lý Session
                if not active_session_id:
                    new_session = models.ChatSession(
                        title=last_msg_content[:50] + ("..." if len(last_msg_content) > 50 else ""),
                        user_id=current_user.id,
                        folder_id=request.folder_id
                    )
                    db.add(new_session)
                    db.commit()
                    db.refresh(new_session)
                    active_session_id = new_session.id
                else:
                    session_obj = db.query(models.ChatSession).filter(models.ChatSession.id == active_session_id).first()
                    if session_obj:
                        session_obj.updated_at = datetime.datetime.utcnow()
                        db.commit()

                # 2. Lưu tin nhắn người dùng
                user_msg = models.Message(content=last_msg_content, role="user", session_id=active_session_id)
                db.add(user_msg)
                db.commit()

            context_data = ""
            symbols = re.findall(r'\b[A-Z]{3,4}\b', last_msg_content.upper())
            if symbols:
                analyzer = Unified5MAnalyzer(symbols[0])
                context_data = analyzer.get_raw_data()

            today = datetime.datetime.now().strftime("ngày %d tháng %m năm %Y")
            system_prompt = f"""
Bạn là Chuyên gia Chiến lược Đầu tư Chứng khoán cao cấp. 
Phong cách: Tinh tế (Apple-style), điềm đạm, tập trung vào bản chất (Insight).
Ngôn ngữ: Tiếng Việt.

THÔNG TIN THỜI GIAN:
Hôm nay là {today}.

NGUYÊN TẮC CỐT LÕI:
- KHÔNG cung cấp quá nhiều số liệu thô (có thể tìm thấy trên mạng).
- PHẢI chuyển hóa dữ liệu tài chính thành các "insight phi tài chính" (non-financial insights) dễ hiểu. 
  Ví dụ: Thay vì nói "ROE 20%", hãy giải thích "Đây là doanh nghiệp có khả năng vắt sữa tiền cực tốt từ vốn của mình, cho thấy vị thế độc quyền hoặc quản trị rất sát sao".
- Đưa ra các nhận định, ý kiến mang tính chiến lược và định hướng thay vì liệt kê số liệu.

QUY TẮC TRÌNH BÀY BẮT BUỘC:
- TUYỆT ĐỐI KHÔNG sử dụng các ký tự: ###, ***, ---, **.
- KHÔNG sử dụng in đậm, in nghiêng bằng ký hiệu Markdown.
- Sử dụng khoảng trắng và xuống dòng để phân đoạn.
- Nếu sử dụng thuật ngữ tiếng Anh, PHẢI mở ngoặc đơn chú thích tiếng Việt.

QUY TẮC PHẢN HỒI:
1. NẾU CÓ MÃ CỔ PHIẾU CỤ THỂ ({symbols[0] if symbols else 'N/A'}):
   - Phân tích 5M (Ý nghĩa, Lợi thế, Ban lãnh đạo, Biên an toàn, Tiền).
   - TẬP TRUNG vào: Tại sao nó quan trọng? Lợi thế cạnh tranh thực sự là gì? Đội ngũ lãnh đạo có "tâm và tầm" như thế nào thông qua các con số?
   - Sử dụng dữ liệu thực tế để chứng minh nhận định: {context_data}

2. NẾU KHÔNG CÓ MÃ CỔ PHIẾU:
   - Sử dụng kỹ năng Stock Analysis (Phân tích chứng khoán) và kinh tế học để nhận định thị trường, xu hướng nhóm ngành và dòng tiền.
   - Trả lời như một người cố vấn chiến lược, đưa ra góc nhìn về "cuộc chơi" của các ông lớn (Big Boys) và tâm lý đám đông.

3. TƯƠNG TÁC: Hỏi về mục tiêu và vốn để tư vấn cá nhân hóa.
"""

            full_response = ""
            try:
                async for chunk in call_llm_stream(request.bot_type, system_prompt, request.messages):
                    clean_chunk = chunk.replace("###", "").replace("***", "")
                    full_response += clean_chunk
                    yield clean_chunk
            except Exception as e:
                print(f"Primary LLM ({request.bot_type}) failed: {str(e)}")
                if request.bot_type != "openrouter":
                    yield "\n\n(Chế độ dự phòng đang được kích hoạt...)\n\n"
                    async for chunk in call_llm_stream("openrouter", system_prompt, request.messages):
                        full_response += chunk
                        yield chunk
                else:
                    raise e

            if current_user and active_session_id:
                bot_msg = models.Message(content=full_response, role="assistant", session_id=active_session_id)
                db.add(bot_msg)
                db.commit()

        except Exception as e:
            print(f"STREAM ERROR: {str(e)}")
            yield "Xin lỗi, hiện tại hệ thống đang gặp sự cố kết nối. Vui lòng thử lại sau."

    return StreamingResponse(event_generator(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
