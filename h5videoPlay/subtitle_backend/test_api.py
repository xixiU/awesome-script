#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试字幕服务 API
"""

import requests
import time

def test_health_check():
    """测试健康检查接口"""
    print("测试健康检查接口...")
    try:
        response = requests.get("http://localhost:8765/health")
        data = response.json()
        print(f"✅ 健康检查通过: {data}")
        return True
    except Exception as e:
        print(f"❌ 健康检查失败: {e}")
        return False

def test_languages():
    """测试语言列表接口"""
    print("\n测试语言列表接口...")
    try:
        response = requests.get("http://localhost:8765/languages")
        data = response.json()
        print("✅ 支持的语言:")
        for code, name in data["languages"].items():
            print(f"   {code}: {name}")
        return True
    except Exception as e:
        print(f"❌ 获取语言列表失败: {e}")
        return False

def test_translate():
    """测试翻译接口"""
    print("\n测试翻译接口...")
    try:
        response = requests.post(
            "http://localhost:8765/translate",
            data={
                "text": "Hello, World!",
                "target_lang": "zh-CN",
                "source_lang": "en"
            }
        )
        data = response.json()
        if data["success"]:
            print(f"✅ 翻译成功:")
            print(f"   原文: {data['original']}")
            print(f"   译文: {data['translated']}")
            return True
        else:
            print(f"❌ 翻译失败")
            return False
    except Exception as e:
        print(f"❌ 翻译请求失败: {e}")
        return False

def test_transcribe():
    """测试转录接口（需要音频文件）"""
    print("\n测试转录接口...")
    print("⚠️  需要提供音频文件来测试此功能")
    print("   使用方法:")
    print("   1. 准备一个音频文件（mp3, wav, m4a 等）")
    print("   2. 运行以下命令：")
    print('      curl -X POST "http://localhost:8765/transcribe" \\')
    print('        -F "file=@your_audio.mp3" \\')
    print('        -F "translate_to=zh-CN"')

def main():
    """运行所有测试"""
    print("=" * 50)
    print("字幕服务 API 测试")
    print("=" * 50)
    
    # 等待服务启动
    print("\n检查服务是否运行...")
    max_retries = 5
    for i in range(max_retries):
        try:
            requests.get("http://localhost:8765/")
            print("✅ 服务已就绪")
            break
        except:
            if i < max_retries - 1:
                print(f"等待服务启动... ({i+1}/{max_retries})")
                time.sleep(2)
            else:
                print("❌ 无法连接到服务，请确保后端服务正在运行")
                print("   启动命令: ./start.sh")
                return
    
    # 运行测试
    results = []
    results.append(("健康检查", test_health_check()))
    results.append(("语言列表", test_languages()))
    results.append(("文本翻译", test_translate()))
    test_transcribe()
    
    # 打印测试结果
    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name}: {status}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\n总计: {passed}/{total} 项测试通过")
    
    if passed == total:
        print("\n🎉 所有测试通过！服务运行正常。")
    else:
        print("\n⚠️  部分测试失败，请检查服务配置。")

if __name__ == "__main__":
    main()

