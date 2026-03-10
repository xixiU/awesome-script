// 飞书文档转 Markdown/Word - Content Script (优化版)

(function() {
    'use strict';

    let isProcessing = false;
    let exportOptions = {
        includeImages: true,
        includeText: true,
        includeTables: true
    };

    // 等待元素加载
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Element not found'));
            }, timeout);
        });
    }

    // 创建导出按钮（悬停展开式）
    function createExportButton() {
        // 检查按钮是否已存在
        if (document.getElementById('feishu-export-container')) {
            return;
        }

        // 创建容器
        const container = document.createElement('div');
        container.id = 'feishu-export-container';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
        `;

        // 创建主按钮
        const mainButton = document.createElement('button');
