import ddddocr
import base64
from flask import Flask, request, jsonify
import io

# 初始化 ddddocr，建议在应用启动时执行一次，而不是在每个请求中都执行
# 你可以根据需要选择不同的模型，例如：
# ocr = ddddocr.DdddOcr()  # 普通验证码
# ocr = ddddocr.DdddOcr(det=True) # 带检测框的
# ocr = ddddocr.DdddOcr(beta=True) # 测试版，可能包含更新的模型
# ocr = ddddocr.DdddOcr(show_ad=False) # 关闭广告（如果有的话）
try:
    ocr = ddddocr.DdddOcr(show_ad=False)
except Exception as e:
    print(f"初始化ddddocr失败，请确保已正确安装ddddocr及其依赖: {e}")
    print("你可能需要手动下载模型文件。详情请查阅ddddocr的官方文档。")
    ocr = None # 设置为None，以便在API中检查

app = Flask(__name__)

@app.route('/recognize_captcha', methods=['POST'])
def recognize_captcha():
    if ocr is None:
        return jsonify({"error": "OCR服务未初始化，请检查服务器日志。"}), 500

    try:
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({"error": "请求体中未找到 'image_base64' 字段或请求体不是有效的JSON。"}), 400

        image_base64_string = data['image_base64']

        # 移除可能的 data URI scheme 前缀 (例如 "data:image/jpeg;base64,")
        if ',' in image_base64_string:
            image_base64_string = image_base64_string.split(',', 1)[1]

        # Base64解码
        try:
            image_bytes = base64.b64decode(image_base64_string)
        except base64.binascii.Error as e:
            return jsonify({"error": f"Base64解码失败: {e}"}), 400
        except Exception as e:
            return jsonify({"error": f"Base64解码时发生未知错误: {e}"}), 400

        if not image_bytes:
            return jsonify({"error": "解码后的图像数据为空。"}), 400

        # 使用ddddocr进行识别
        result = ocr.classification(image_bytes)

        # 直接返回识别结果字符串
        # 如果希望返回JSON格式，可以使用 jsonify({"result": result})
        return jsonify({"result": result})

    except Exception as e:
        # 记录更详细的错误信息到服务器日志
        app.logger.error(f"处理请求时发生错误: {e}", exc_info=True)
        return jsonify({"error": f"处理请求时发生内部错误: {str(e)}"}), 500

if __name__ == '__main__':
    # 确保在开发环境中运行，生产环境请使用 Gunicorn 或 uWSGI 等WSGI服务器
    # 例如: flask run --host=0.0.0.0 --port=5000
    # 或者在代码中指定:
    app.run(host='0.0.0.0', port=9876, debug=True)
    # 注意：debug=True 不应在生产环境中使用