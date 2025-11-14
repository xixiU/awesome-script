// ========================================
// 字幕功能诊断工具
// 在浏览器控制台（F12）直接复制粘贴运行
// ========================================

(function () {
    console.log('%c=== 字幕功能完整诊断 ===', 'color: #00a1d6; font-size: 16px; font-weight: bold');

    const video = document.querySelector('video');

    if (!video) {
        console.error('❌ 未找到视频元素');
        return;
    }

    // 1. 视频基本信息
    console.log('%c1. 视频基本信息', 'color: #4CAF50; font-weight: bold');
    const videoSrc = video.currentSrc || video.src;
    const videoOrigin = videoSrc ? new URL(videoSrc).origin : '';
    const pageOrigin = location.origin;
    const isCrossOrigin = videoOrigin && videoOrigin !== pageOrigin;

    console.log('视频地址:', videoSrc);
    console.log('视频域名:', videoOrigin);
    console.log('页面域名:', pageOrigin);
    console.log('是否跨域:', isCrossOrigin, isCrossOrigin ? '❌ 不支持字幕' : '✅ 支持字幕');
    console.log('crossOrigin 属性:', video.crossOrigin || '未设置');

    // 2. 播放状态
    console.log('%c2. 播放状态', 'color: #4CAF50; font-weight: bold');
    console.log('是否播放:', !video.paused, video.paused ? '❌ 未播放' : '✅ 播放中');
    console.log('是否结束:', video.ended);
    console.log('音量:', video.volume);
    console.log('静音:', video.muted, video.muted ? '⚠️ 静音' : '✅');
    console.log('readyState:', video.readyState, video.readyState >= 3 ? '✅' : '⚠️');
    console.log('当前时间:', video.currentTime.toFixed(2), '/', video.duration.toFixed(2));

    // 3. API 支持检查
    console.log('%c3. API 支持检查', 'color: #4CAF50; font-weight: bold');
    console.log('captureStream:', !!video.captureStream, !!video.captureStream ? '✅' : '❌');
    console.log('mozCaptureStream:', !!video.mozCaptureStream, !!video.mozCaptureStream ? '✅' : '❌');
    console.log('MediaRecorder:', !!window.MediaRecorder, !!window.MediaRecorder ? '✅' : '❌');
    console.log('AudioContext:', !!(window.AudioContext || window.webkitAudioContext),
        !!(window.AudioContext || window.webkitAudioContext) ? '✅' : '❌');

    // 4. 音频捕获测试
    console.log('%c4. 音频捕获测试', 'color: #4CAF50; font-weight: bold');
    try {
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        console.log('✅ captureStream 成功');

        const audioTracks = stream.getAudioTracks();
        console.log('音轨数量:', audioTracks.length, audioTracks.length > 0 ? '✅' : '❌');

        if (audioTracks.length > 0) {
            audioTracks.forEach((track, i) => {
                console.log(`  音轨 ${i}:`, {
                    id: track.id,
                    label: track.label || '(unnamed)',
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                });
            });
        }

        // 5. MediaRecorder 测试
        console.log('%c5. MediaRecorder 测试', 'color: #4CAF50; font-weight: bold');
        try {
            const recorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            console.log('✅ MediaRecorder 创建成功');
            console.log('MIME 类型:', recorder.mimeType);
            console.log('状态:', recorder.state);

            // 尝试启动
            let dataReceived = false;
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    dataReceived = true;
                    console.log(`✅ 接收到音频数据: ${e.data.size} bytes`);
                }
            };

            recorder.start(1000);
            console.log('✅ MediaRecorder 启动成功');

            setTimeout(() => {
                recorder.stop();
                setTimeout(() => {
                    if (dataReceived) {
                        console.log('%c✅✅✅ 测试通过！字幕功能应该可以正常工作', 'color: #4CAF50; font-size: 14px; font-weight: bold');
                    } else {
                        console.warn('%c⚠️ 未接收到音频数据，可能是跨域限制', 'color: #ff9800; font-size: 14px; font-weight: bold');
                    }
                }, 500);
            }, 3000);

        } catch (recorderError) {
            console.error('❌ MediaRecorder 启动失败:', recorderError.name, recorderError.message);

            if (isCrossOrigin) {
                console.error('%c❌ 原因：跨域视频限制', 'color: #f44336; font-size: 14px; font-weight: bold');
                console.log('%c解决方案：', 'color: #2196F3; font-weight: bold');
                console.log('1. 在 Bilibili (bilibili.com) 等同域网站使用');
                console.log('2. 打开 test_page.html 进行本地测试');
                console.log('3. YouTube 等跨域网站暂时无法使用字幕功能');
            } else {
                console.error('❌ 未知错误，可能是浏览器限制');
            }
        }

    } catch (captureError) {
        console.error('❌ captureStream 失败:', captureError.name, captureError.message);
        if (isCrossOrigin) {
            console.error('原因：跨域视频');
        }
    }

    // 6. 后端服务检查
    console.log('%c6. 后端服务检查', 'color: #4CAF50; font-weight: bold');
    fetch('http://localhost:8765/health')
        .then(r => r.json())
        .then(data => {
            console.log('✅ 后端服务正常:', data);
        })
        .catch(error => {
            console.error('❌ 后端服务连接失败:', error.message);
            console.log('请启动服务: cd subtitle_backend && ./start.sh');
        });

    // 7. 总结建议
    setTimeout(() => {
        console.log('%c=== 诊断完成 ===', 'color: #00a1d6; font-size: 16px; font-weight: bold');

        if (isCrossOrigin) {
            console.log('%c❌ 当前网站不支持字幕功能（跨域视频）', 'color: #f44336; font-size: 14px');
            console.log('%c建议：', 'color: #2196F3; font-weight: bold');
            console.log('• 在 Bilibili (bilibili.com) 使用字幕功能');
            console.log('• 在当前网站使用其他快捷键（V/X/Z、←/→、P、I 等）');
        } else if (!video.paused) {
            console.log('%c✅ 当前网站应该支持字幕功能', 'color: #4CAF50; font-size: 14px');
            console.log('提示：按 S 键开启字幕');
        } else {
            console.log('%c⚠️ 请先播放视频，然后按 S 键', 'color: #ff9800; font-size: 14px');
        }
    }, 4000);

})();

