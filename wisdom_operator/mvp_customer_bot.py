# mvp_customer_bot.py
# MVP：macOS 千牛自动客服建议助手 + UI 区域选择

import pyautogui
import easyocr
from openai import OpenAI
import json
import time
import os
import pyperclip
import tkinter as tk
from tkinter import messagebox
from PIL import ImageGrab  # 用于替代 pyautogui 截图避免黑屏问题
import numpy as np
# ========== 配置 ==========
CONFIG_FILE = 'mvp_config.json'

# 从环境变量中获取 API KEY
# openai.api_key = os.getenv("OPENAI_API_KEY")  # 从环境变量中获取 API KEY
# openai.base_url = "https://models.github.ai/inference"
# token = os.environ["GITHUB_TOKEN"]
# endpoint = "https://models.github.ai/inference"
# model = "openai/gpt-4.1"

# client = openai.OpenAI(
#     base_url=endpoint,
#     api_key=token,
# )
model_name = "gpt-4.1"

client = OpenAI(
    base_url="https://models.inference.ai.azure.com",
    api_key=os.environ["GITHUB_TOKEN"],
)
# ========== 工具函数 ==========
def load_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

# ========== UI 区域选择器 ==========
class RegionSelector:
    def __init__(self, prompt):
        self.root = tk.Tk()
        self.root.attributes('-alpha', 0.3)
        self.root.attributes('-topmost', True)
        self.root.attributes('-fullscreen', True)
        self.root.config(cursor="cross")
        self.start_x = self.start_y = 0
        self.rect = None
        self.selection = None
        self.canvas = tk.Canvas(self.root, bg='gray')
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.root.title(prompt)
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.root.mainloop()

    def on_click(self, event):
        self.start_x, self.start_y = event.x, event.y
        self.rect = self.canvas.create_rectangle(self.start_x, self.start_y, self.start_x, self.start_y, outline='red')

    def on_drag(self, event):
        self.canvas.coords(self.rect, self.start_x, self.start_y, event.x, event.y)

    def on_release(self, event):
        end_x, end_y = event.x, event.y
        x = min(self.start_x, end_x)
        y = min(self.start_y, end_y)
        w = abs(self.start_x - end_x)
        h = abs(self.start_y - end_y)
        self.selection = [x, y, w, h]
        self.root.destroy()

def select_region(prompt):
    print(f"请选择：{prompt}")
    selector = RegionSelector(prompt)
    return selector.selection

# ========== 模块1：感知 ==========
def get_latest_message(region):
    x, y, w, h = region
    screenshot = ImageGrab.grab(bbox=(x, y, x + w, y + h)).convert('RGB')

    # 保存截图到本地，便于调试
    os.makedirs('image', exist_ok=True)
    screenshot.save('image/image.png')

    screenshot_np = np.asarray(screenshot, dtype=np.uint8)
    reader = easyocr.Reader(['ch_sim', 'en'], gpu=True)
    results = reader.readtext(screenshot_np)
    if not results:
        return ""
    texts = [r[1] for r in results]
    return texts if texts else ""

# ========== 模块2：决策 ==========
def generate_reply(user_question):
    prompt = f"你是一个淘宝客服助理，提供的产品是针对用户的网课进行学习，凡是没有过期的网课都可以学习,学习的时间大概半天左右，为了避免登录检测得问题，请提供账号密码登录的方式，这比验证码更好。学习的费用是20元一门课，或者2元一学时，要针对用户的提问回答，不要回答无关的问题。商家的名称是【码农新世界】,用户的问题和过往的聊天信息如下，请给出亲切、专业、简洁的中文回复，不包含表情符号。\n问题与过往聊天信息：{user_question}"
    response = client.chat.completions.create(
        model=model_name,#"gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        )
    return response.choices[0].message.content.strip()

# ========== 模块3：执行 ==========
def paste_reply(reply_text, input_region):
    pyautogui.click(input_region[0]+10, input_region[1]+10)
    pyautogui.hotkey('command', 'a')
    pyperclip.copy(reply_text)
    pyautogui.hotkey('command', 'v')

# ========== 主逻辑 ==========
def main():
    if not os.path.exists(CONFIG_FILE):
        messagebox.showinfo("提示", "首次运行，请选择聊天区域和输入框区域")
        chat_region = select_region("聊天记录区域")
        input_region = select_region("输入框区域")
        save_config({"chat_region": chat_region, "input_region": input_region})
    else:
        config = load_config()
        chat_region = config['chat_region']
        input_region = config['input_region']

    print("开始运行一次智能建议流程...")
    question = get_latest_message(chat_region)
    if not question:
        print("未识别到问题内容，退出。")
        return

    print(f"识别到问题：{question}")
    reply = generate_reply(question)
    print(f"生成回答：{reply}")
    paste_reply(reply, input_region)
    print("已填入建议答案，请人工确认后手动发送。")

if __name__ == '__main__':
    main()
    # print(generate_reply("我学完和你说哈"))
