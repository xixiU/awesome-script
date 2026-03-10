import asyncio
from playwright.async_api import async_playwright
import json
import sys
import io

# 修复 Windows 控制台编码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def analyze_feishu_download():
    """分析飞书文档下载的网络请求"""

    async with async_playwright() as p:
        # 启动浏览器（非无头模式，方便用户登录）
        browser = await p.chromium.launch(headless=False, args=['--start-maximized'])
        context = await browser.new_context(viewport=None)
        page = await context.new_page()

        # 存储网络请求
        requests_log = []
        responses_log = []

        # 监听所有网络请求
        async def log_request(request):
            if 'export' in request.url or 'download' in request.url:
                req_data = {
                    'url': request.url,
                    'method': request.method,
                    'headers': dict(request.headers),
                    'post_data': request.post_data if request.method == 'POST' else None
                }
                requests_log.append(req_data)
                print(f"\n🔵 请求: {request.method} {request.url}")
                if request.post_data:
                    print(f"   Body: {request.post_data}")

        async def log_response(response):
            if 'export' in response.url or 'download' in response.url:
                try:
                    body = await response.text()
                    resp_data = {
                        'url': response.url,
                        'status': response.status,
                        'headers': dict(response.headers),
                        'body': body[:500] if len(body) > 500 else body  # 只记录前500字符
                    }
                    responses_log.append(resp_data)
                    print(f"\n🟢 响应: {response.status} {response.url}")
                    print(f"   Body: {body[:200]}...")
                except Exception as e:
                    print(f"   无法读取响应体: {e}")

        page.on('request', log_request)
        page.on('response', log_response)

        # 打开飞书文档
        url = 'https://yf2ljykclb.xfchat.iflytek.com/docx/doxrzSC1PjjSju4TjR6Jgeh6Euc'
        print(f"\n📖 正在打开: {url}")
        try:
            await page.goto(url, timeout=60000, wait_until='domcontentloaded')
        except Exception as e:
            print(f"⚠️  页面加载超时，但继续等待用户操作: {e}")
            print("   浏览器窗口应该已经打开，请手动刷新页面")

        print("\n" + "="*80)
        print("⚠️  请在浏览器中完成以下操作：")
        print("1. 如果需要，请登录飞书账号")
        print("2. 等待文档加载完成")
        print("3. 点击右上角的 '...' 按钮")
        print("4. 选择 '下载为' → 'Word'")
        print("5. 观察控制台输出的网络请求")
        print("6. 完成后在终端按 Ctrl+C 退出")
        print("="*80 + "\n")

        try:
            # 等待用户操作，最多等待 10 分钟
            await asyncio.sleep(600)
        except KeyboardInterrupt:
            print("\n\n用户中断，正在保存日志...")

        # 保存日志到文件
        log_file = 'D:/source/awesome-script/feishuToMarkdown/chrome-extension/network_log.json'
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump({
                'requests': requests_log,
                'responses': responses_log
            }, f, ensure_ascii=False, indent=2)

        print(f"\n✅ 网络日志已保存到: {log_file}")
        print(f"   共捕获 {len(requests_log)} 个相关请求")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(analyze_feishu_download())
