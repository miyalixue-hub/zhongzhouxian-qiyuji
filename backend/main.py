#!/usr/bin/env python3
"""
AI 魔法师训练营 · 3D 分享系统后端
功能：
  1. 接收 STL 上传 + 自动修复 + 格式转换
  2. 生成分享链接
  3. 提供作品详情 API（H5 页面调用）
  4. 提供 STL/3MF 下载

部署在腾讯云服务器，通过 Nginx 反向代理对外提供服务。
"""

import json
import os
import sys
import time
import uuid
import shutil
import urllib.request
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ====== 路径配置 ======
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"       # 原始上传
REPAIRED_DIR = BASE_DIR / "repaired"     # 修复后的模型
STATIC_DIR = BASE_DIR / "static"         # H5 分享页静态文件
DATA_FILE = BASE_DIR / "works.json"      # 作品数据索引

# 确保目录存在
for d in [UPLOADS_DIR, REPAIRED_DIR, STATIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# 初始化数据文件
if not DATA_FILE.exists():
    DATA_FILE.write_text("{}", encoding="utf-8")

# ====== 导入 STL 修复脚本 ======
# 脚本在上级目录的 scripts/ 下
SCRIPTS_DIR = BASE_DIR.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

try:
    from stl_repair import repair_stl
    print("✅ STL 修复模块加载成功")
except ImportError as e:
    print(f"⚠️ STL 修复模块加载失败: {e}")
    repair_stl = None

# ====== FastAPI 应用 ======
app = FastAPI(title="AI 魔法师 · 3D 分享系统", version="1.0.0")

# CORS（允许研学网站跨域调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 正式版改为具体域名
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务（H5 分享页）
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ====== 数据读写 ======

def load_works() -> dict:
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def save_works(data: dict):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ====== API 路由 ======

@app.get("/")
async def index():
    """根路径 → 健康检查"""
    return {
        "status": "ok",
        "service": "AI 魔法师 · 3D 分享系统",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/work/upload": "上传作品",
            "GET /api/work/detail?id=xxx": "作品详情",
            "GET /api/work/download?id=xxx&format=stl|3mf": "下载模型",
            "GET /share?id=xxx": "H5 分享页",
        }
    }


@app.post("/api/work/upload")
async def upload_work(
    stl_file: Optional[UploadFile] = File(None),
    student_name: str = Form(default="匿名"),
    work_title: str = Form(default="我的守护神兽"),
    artwork_image_url: str = Form(default=""),
    model_url: Optional[str] = Form(default=""),
):
    """
    接收研学网站上传的 STL 文件（或 Meshy URL），自动修复，返回分享 ID。
    支持两种方式：
      1. 直接上传 stl_file（FormData 文件）
      2. 传 model_url（后端自动下载）
    """
    # 确定文件来源：优先用上传文件，其次用 URL 下载
    content = None
    ext = None

    if stl_file and stl_file.filename:
        ext = Path(stl_file.filename).suffix.lower()
        content = await stl_file.read()
    elif model_url:
        # 从 URL 下载文件
        try:
            url_lower = model_url.lower()
            if '.3mf' in url_lower:
                ext = '.3mf'
            elif '.stl' in url_lower:
                ext = '.stl'
            else:
                ext = '.stl'  # 默认
            
            req = urllib.request.Request(model_url, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; AIMagicBot/1.0)'
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无法从URL下载模型: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="需要上传文件或提供模型URL")

    if ext not in ('.stl', '.3mf'):
        raise HTTPException(status_code=400, detail="只支持 .stl 和 .3mf 格式文件")

    if not content:
        raise HTTPException(status_code=400, detail="文件内容为空")

    if len(content) > 50 * 1024 * 1024:  # 50MB 限制
        raise HTTPException(status_code=413, detail="文件太大，最大 50MB")

    # 生成作品 ID
    work_id = uuid.uuid4().hex[:12]
    timestamp = int(time.time())

    # 保存原始文件
    original_path = UPLOADS_DIR / f"{work_id}{ext}"
    
    original_path.write_bytes(content)

    # 执行修复（同时输出 STL 和 3MF 两种格式）
    stl_repaired_path = REPAIRED_DIR / f"{work_id}.stl"
    threemf_repaired_path = REPAIRED_DIR / f"{work_id}.3mf"

    repair_success = False
    repair_msg = ""

    if repair_stl:
        try:
            # 修复并输出 STL
            repair_stl(
                str(original_path),
                str(stl_repaired_path),
                target_height=80,
                output_format='stl',
                verbose=False
            )
            # 修复并输出 3MF
            repair_stl(
                str(original_path),
                str(threemf_repaired_path),
                target_height=80,
                output_format='3mf',
                verbose=False
            )
            repair_success = True
            repair_msg = "自动修复成功"
        except Exception as e:
            repair_msg = f"修复失败（已保留原始文件）: {str(e)}"
            # 修复失败时，把原始文件拷贝为输出文件
            shutil.copy2(str(original_path), str(stl_repaired_path))
    else:
        # 修复模块不可用，直接存原始文件
        shutil.copy2(str(original_path), str(stl_repaired_path))
        repair_msg = "修复模块未加载，已保存原始文件"

    # 记录作品数据
    works = load_works()
    works[work_id] = {
        "id": work_id,
        "studentName": student_name,
        "title": work_title,
        "subtitle": f"这是{student_name}创造的守护神兽",
        "avatarLetter": student_name[0] if student_name else "我",
        "artworkImage": artwork_image_url,
        "originalFile": str(original_path.name),
        "stlFile": str(stl_repaired_path.name),
        "threemfFile": str(threemf_repaired_path.name) if threemf_repaired_path.exists() else "",
        "createdAt": timestamp,
        "repairStatus": "success" if repair_success else "fallback",
        "repairMessage": repair_msg,
    }
    save_works(works)

    return {
        "success": True,
        "workId": work_id,
        "shareUrl": f"/share?id={work_id}",
        "repairStatus": "success" if repair_success else "fallback",
        "repairMessage": repair_msg,
    }


@app.get("/api/work/detail")
async def get_work_detail(id: str = Query(...)):
    """
    获取作品详情，供 H5 分享页调用。
    """
    works = load_works()
    work = works.get(id)
    
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")

    # 构造返回数据（含文件访问 URL）
    stl_url = f"/api/work/stl?id={id}"
    threemf_available = bool(work.get("threemfFile"))

    return {
        "id": work["id"],
        "title": work["title"],
        "subtitle": work["subtitle"],
        "studentName": work["studentName"],
        "avatarLetter": work["avatarLetter"],
        "artworkImage": work["artworkImage"],  # 空串时前端会用占位图
        "stlUrl": stl_url,
        "has3mf": threemf_available,
        "createdAt": work["createdAt"],
    }


@app.get("/api/work/download")
async def download_model(
    id: str = Query(...),
    format: str = Query(default="stl", regex="^(stl|3mf)$"),
):
    """
    下载修复后的模型文件（STL 或 3MF）。
    """
    works = load_works()
    work = works.get(id)
    
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")

    if format == "3mf":
        filename = work.get("threemfFile", "")
        if not filename:
            raise HTTPException(status_code=404, detail="该作品暂无 3MF 文件")
        file_path = REPAIRED_DIR / filename
        return FileResponse(
            str(file_path),
            media_type="application/octet-stream",
            filename=f"神兽_{work['title']}.3mf",
        )
    else:  # stl
        filename = work.get("stlFile", "")
        if not filename:
            raise HTTPException(status_code=404, detail="该作品暂无 STL 文件")
        file_path = REPAIRED_DIR / filename
        return FileResponse(
            str(file_path),
            media_type="application/octet-stream",
            filename=f"神兽_{work['title']}.stl",
        )


@app.get("/api/work/stl")
async def get_stl_for_preview(id: str = Query(...)):
    """
    获取 STL 文件（供 Three.js 预览用），与 download 共用逻辑。
    """
    works = load_works()
    work = works.get(id)
    
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")

    filename = work.get("stlFile", "")
    if not filename:
        raise HTTPException(status_code=404, detail="该作品暂无 STL 文件")
    
    file_path = REPAIRED_DIR / filename
    return FileResponse(str(file_path), media_type="application/octet-stream")


@app.get("/share")
async def share_page(id: str = Query(default="")):
    """
    返回 H5 分享页（带作品 ID 参数）。
    """
    html_path = STATIC_DIR / "index.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="分享页不存在")
    
    html_content = html_path.read_text(encoding="utf-8")
    
    # 注入作品 ID 到页面（让 JS 自动获取）
    if id:
        # 如果 URL 参数已携带，前端 JS 会自动读取
        pass
    
    return HTMLResponse(html_content)


# ====== 启动入口 ======
if __name__ == "__main__":
    import uvicorn
    print("""
    ╔══════════════════════════════════════════╗
    ║  🪄 AI 魔法师 · 3D 分享系统后端 v1.0    ║
    ║  端口: 8080                              ║
    ║  分享页: http://localhost:8080/share     ║
    ╚══════════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=8080)
